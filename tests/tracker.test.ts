import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readDeaths } from "../src/main/save/parser";
import { Tracker } from "../src/main/tracker";
import { buildSave, writeSave, type FakeCharacter } from "./fakeSave";

let root: string;
let appData: string;
let save: string;
let tracker: Tracker;
let bump = 0;

function write(chars: Record<number, FakeCharacter>, path = save) {
  writeSave(path, chars);
  const t = Date.now() / 1000 + ++bump;
  utimesSync(path, t, t);
}

function make() {
  tracker = new Tracker(join(root, "data"), join(root, "obs"), appData);
  return tracker;
}

/** connect + read once, without the timers */
function poll(t: Tracker) {
  (t as any).connect();
  t.poll();
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dc-"));
  appData = join(root, "appdata");
  save = join(appData, "EldenRing", "76561198000000001", "ER0000.sl2");
});
afterEach(() => {
  (tracker as any)?.watcher?.close();
  rmSync(root, { recursive: true, force: true });
});

describe("save parser", () => {
  it("reads the death count", () => {
    expect(readDeaths(buildSave({ 1: ["Tarnished", 12, 3600, 143] }), 1)).toBe(143);
  });
});

describe("tracker", () => {
  it("counts existing deaths in the total, not the session", () => {
    write({ 1: ["Tarnished", 12, 3600, 143] });
    const t = make();
    poll(t);
    expect([t.total(), t.session(), t.status]).toEqual([143, 0, "watching"]);
    write({ 1: ["Tarnished", 12, 3700, 145] });
    t.poll();
    expect([t.total(), t.session()]).toEqual([145, 2]);
  });

  it("shows 0, 9, 10 and 100", () => {
    for (const n of [0, 9, 10, 100]) {
      write({ 1: ["Tarnished", 12, 3600 + n, n] });
      const t = make();
      poll(t);
      expect(t.total()).toBe(n);
    }
  });

  it("follows the character being played", () => {
    write({ 1: ["Main", 80, 90000, 500], 2: ["Alt", 10, 2000, 9] });
    const t = make();
    poll(t);
    expect(t.slot).toBe(1);
    write({ 1: ["Main", 80, 90000, 500], 2: ["Alt", 10, 2100, 10] });
    t.poll();
    expect([t.slot, t.total(), t.session()]).toEqual([2, 10, 0]);
  });

  it("picks the newest of several profiles", () => {
    const other = join(appData, "EldenRing", "76561198000000002", "ER0000.sl2");
    writeSave(other, { 1: ["Old", 5, 100, 1] });
    utimesSync(other, 1, 1);
    write({ 1: ["New", 5, 100, 7] });
    const t = make();
    poll(t);
    expect(t.total()).toBe(7);
  });

  it("searches without a save and counts by hand", () => {
    const t = make();
    poll(t);
    expect(t.status).toBe("searching");
    t.apply({ type: "deathAdd" });
    expect([t.total(), t.session()]).toEqual([1, 1]);
  });

  it("does not add hand counts to a save found later", () => {
    const t = make();
    poll(t);
    t.apply({ type: "deathAdd", amount: 5 });
    write({ 1: ["Tarnished", 12, 3600, 9] });
    poll(t);
    expect(t.total()).toBe(9);
  });

  it("keeps the last value on a broken save", () => {
    write({ 1: ["Tarnished", 12, 3600, 20] });
    const t = make();
    poll(t);
    writeFileSync(save, Buffer.concat([Buffer.from("BND4"), Buffer.alloc(100)]));
    t.poll();
    expect([t.status, t.total()]).toEqual(["error", 20]);
  });

  it("credits deaths to the selected boss", () => {
    write({ 1: ["Tarnished", 12, 3600, 0] });
    const t = make();
    poll(t);
    const margit = t.bosses[0];
    t.apply({ type: "bossSet", id: margit.id });
    write({ 1: ["Tarnished", 12, 3700, 3] });
    t.poll();
    expect(margit.deaths).toBe(3);
  });
});
