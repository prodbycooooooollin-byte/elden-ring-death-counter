// Counter state: finds and watches the save, follows the played character, bosses, settings, persistence.

import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { listCharacters, readDeaths, SaveError, type Character } from "./save/parser";
import { PRESETS } from "./bosses";
import type { Boss, LogEntry, Settings, State, SaveStatus, Action } from "../shared/types";

export const DEFAULT_SETTINGS: Settings = {
  language: "de",
  overlay: {
    layout: "emblem",
    position: "tr",
    scale: 100,
    backdrop: 45,
    label: "",
    showSession: false,
    showBoss: false,
    showRate: false,
    showTimer: false,
    showIcon: true,
  },
  session: { resetOnStart: true },
  updates: { autoInstall: true },
};

const MAX_LOG = 300;

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    if (!(key in out)) continue;
    const current = out[key];
    if (current && typeof current === "object" && !Array.isArray(current)) out[key] = deepMerge(current, value);
    else if (typeof value === typeof current) out[key] = value;
  }
  return out;
}

function clampSettings(s: Settings): Settings {
  const o = s.overlay;
  if (!["emblem", "hud", "compact", "bossbar"].includes(o.layout)) o.layout = "emblem";
  if (!["tl", "tr", "bl", "br"].includes(o.position)) o.position = "tr";
  o.scale = Math.min(250, Math.max(40, Math.round(o.scale)));
  o.backdrop = Math.min(100, Math.max(0, Math.round(o.backdrop)));
  o.label = o.label.slice(0, 24);
  if (!["de", "en"].includes(s.language)) s.language = "de";
  return s;
}

/** Every Elden Ring save on this PC, newest first (several Steam profiles, Seamless Coop). */
export function findSaves(appData = process.env.APPDATA): string[] {
  if (!appData) return [];
  const root = join(appData, "EldenRing");
  if (!existsSync(root)) return [];
  const found: { path: string; mtime: number }[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of ["ER0000.sl2", "ER0000.co2"]) {
      const path = join(root, entry.name, name);
      try {
        found.push({ path, mtime: statSync(path).mtimeMs });
      } catch {
        /* not there */
      }
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime).map((f) => f.path);
}

function stamp(path: string) {
  const s = statSync(path);
  return `${s.ino}:${s.size}:${s.mtimeMs}`;
}

/** Read the whole save and make sure the game did not write to it meanwhile. */
function readSnapshot(path: string) {
  const before = stamp(path);
  const data = readFileSync(path);
  const after = stamp(path);
  if (before !== after || data.length !== statSync(path).size) throw new SaveError("Spielstand wird gerade aktualisiert.");
  return { data, stamp: after };
}

export class Tracker extends EventEmitter {
  settings: Settings;
  bosses: Boss[];
  currentBoss: string | null;
  offset: number;
  lastSaveTotal: number | null;
  sessionStarted = Date.now() / 1000;
  sessionSave = 0;
  sessionManual = 0;
  log: LogEntry[] = [];

  savePath: string | null = null;
  slot: number | null = null;
  slotPinned: boolean;
  characters: Character[] = [];
  character: Character | null = null;
  saveTotal: number | null = null;
  status: SaveStatus = "idle";
  message = "";
  updated: number | null = null;

  private stampValue: string | null = null;
  private previous: { character: Character; total: number } | null = null;
  private playtimes = new Map<number, number>();
  private watcher: FSWatcher | null = null;
  private watchedDir: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly stateFile: string;

  constructor(private readonly dataDir: string, private readonly obsDir: string, private readonly appData = process.env.APPDATA) {
    super();
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(obsDir, { recursive: true });
    this.stateFile = join(dataDir, "state.json");
    let stored: any = {};
    try {
      stored = JSON.parse(readFileSync(this.stateFile, "utf8"));
    } catch {
      /* first start */
    }
    this.settings = clampSettings(deepMerge(structuredClone(DEFAULT_SETTINGS), stored.settings));
    this.bosses = Array.isArray(stored.bosses) ? stored.bosses : PRESETS.map(([name, great, region]) => this.newBoss(name, great, region));
    this.currentBoss = this.bosses.some((b) => b.id === stored.currentBoss) ? stored.currentBoss : null;
    this.offset = Number(stored.offset) || 0;
    this.lastSaveTotal = typeof stored.lastSaveTotal === "number" ? stored.lastSaveTotal : null;
    this.slot = typeof stored.slot === "number" ? stored.slot : null;
    this.slotPinned = Boolean(stored.slotPinned);
    if (!this.settings.session.resetOnStart && stored.session) {
      this.sessionStarted = stored.session.started ?? this.sessionStarted;
      this.sessionSave = stored.session.save ?? 0;
      this.sessionManual = stored.session.manual ?? 0;
      this.log = (stored.session.log ?? []).slice(-MAX_LOG);
    }
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    this.connect();
    // The file watcher reacts instantly; this poll is the safety net (network drives, missed events).
    this.pollTimer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.watcher?.close();
    this.flush();
  }

  private ticks = 0;
  private tick() {
    this.ticks++;
    if (this.ticks % 5 === 0 || !this.savePath) this.connect();
    this.poll();
  }

  /** Pick the newest save and watch its folder. */
  private connect() {
    const newest = findSaves(this.appData)[0] ?? null;
    if (newest && newest !== this.savePath) {
      this.savePath = newest;
      this.offset = 0; // a newly connected save is authoritative
      this.lastSaveTotal = null;
      if (!this.slotPinned) this.slot = null;
      this.rebase();
      this.watchFolder(dirname(newest));
      this.poll();
    } else if (!newest && !this.savePath) {
      this.setStatus("searching", "Noch kein Spielstand gefunden. Die App verbindet sich, sobald Elden Ring speichert.");
    }
  }

  private watchFolder(dir: string) {
    if (this.watchedDir === dir) return;
    this.watcher?.close();
    this.watchedDir = dir;
    try {
      this.watcher = watch(dir, (_event, file) => {
        if (!file || file.startsWith("ER0000")) setTimeout(() => this.poll(), 120);
      });
    } catch {
      this.watcher = null;
    }
  }

  private rebase() {
    this.stampValue = null;
    this.previous = null;
    this.saveTotal = null;
    this.character = null;
    this.characters = [];
    this.playtimes.clear();
  }

  // ---------------------------------------------------------------- reading

  poll() {
    const path = this.savePath;
    if (!path) return;
    try {
      if (stamp(path) === this.stampValue) return;
      const { data, stamp: next } = readSnapshot(path);
      const characters = listCharacters(data);
      if (!characters.length) throw new SaveError("Im Spielstand ist noch kein Charakter vorhanden.");
      const bySlot = new Map(characters.map((c) => [c.slot, c]));
      this.characters = characters;

      // Follow the character being played: only its playtime grows between two saves.
      const grew = characters.filter((c) => this.playtimes.has(c.slot) && c.playtime > this.playtimes.get(c.slot)!);
      this.playtimes = new Map(characters.map((c) => [c.slot, c.playtime]));
      if (!this.slotPinned && grew.length === 1 && grew[0].slot !== this.slot) {
        this.slot = grew[0].slot;
        this.previous = null;
        this.offset = 0;
      }
      if (this.slot === null || !bySlot.has(this.slot)) {
        if (this.slotPinned && this.slot !== null) throw new SaveError(`Slot ${this.slot} ist leer.`);
        this.slot = [...characters].sort((a, b) => b.playtime - a.playtime)[0].slot;
        this.previous = null;
      }
      const character = bySlot.get(this.slot)!;
      const total = readDeaths(data, this.slot);
      if (this.previous) {
        if (character.name !== this.previous.character.name) {
          this.offset = 0;
        } else if (character.playtime >= this.previous.character.playtime && total > this.previous.total) {
          const amount = total - this.previous.total;
          this.sessionSave += amount;
          this.saveTotal = total;
          this.register(amount, "save");
        }
      }
      this.saveTotal = total;
      this.lastSaveTotal = total;
      this.character = character;
      this.previous = { character, total };
      this.stampValue = next;
      this.updated = Date.now() / 1000;
      this.status = "watching";
      this.message = "";
      this.changed();
    } catch (error) {
      const message = (error as NodeJS.ErrnoException).code === "ENOENT"
        ? `Spielstand nicht gefunden: ${path}`
        : error instanceof SaveError ? error.message : `Lesefehler: ${(error as Error).message}`;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.savePath = null;
        this.rebase();
      }
      this.setStatus("error", message);
    }
  }

  private setStatus(status: SaveStatus, message: string) {
    if (status === this.status && message === this.message) return;
    this.status = status;
    this.message = message;
    this.changed();
  }

  // ---------------------------------------------------------------- derived values

  total() {
    return Math.max(0, (this.saveTotal ?? this.lastSaveTotal ?? 0) + this.offset);
  }

  session() {
    return Math.max(0, this.sessionSave + this.sessionManual);
  }

  private boss(id: string | null | undefined) {
    return this.bosses.find((b) => b.id === id) ?? null;
  }

  publicState(): State {
    return {
      settings: this.settings,
      counts: { total: this.total(), session: this.session() },
      session: { started: this.sessionStarted, log: this.log.slice(-80) },
      bosses: this.bosses,
      currentBoss: this.currentBoss,
      save: {
        path: this.savePath,
        file: this.savePath ? basename(this.savePath) : null,
        slot: this.slot,
        slotPinned: this.slotPinned,
        status: this.status,
        message: this.message,
        characters: this.characters,
        character: this.character,
        updated: this.updated,
      },
      serverTime: Date.now() / 1000,
    };
  }

  // ---------------------------------------------------------------- changes

  private changed() {
    this.emit("state", this.publicState());
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, 300);
  }

  flush() {
    const data = {
      settings: this.settings,
      bosses: this.bosses,
      currentBoss: this.currentBoss,
      offset: this.offset,
      lastSaveTotal: this.saveTotal ?? this.lastSaveTotal,
      slot: this.slot,
      slotPinned: this.slotPinned,
      session: { started: this.sessionStarted, save: this.sessionSave, manual: this.sessionManual, log: this.log },
    };
    try {
      const temp = `${this.stateFile}.tmp`;
      writeFileSync(temp, JSON.stringify(data, null, 1));
      renameSync(temp, this.stateFile);
      // Plain text files keep working for "Text (GDI+)" sources in OBS.
      const boss = this.boss(this.currentBoss);
      writeFileSync(join(this.obsDir, "deaths_total.txt"), String(this.total()));
      writeFileSync(join(this.obsDir, "deaths_session.txt"), String(this.session()));
      writeFileSync(join(this.obsDir, "boss_current.txt"), boss ? `${boss.name}: ${boss.deaths}` : "");
    } catch (error) {
      console.error("Zustand nicht gespeichert:", error);
    }
  }

  private register(amount: number, source: "save" | "manual") {
    const boss = this.boss(this.currentBoss);
    const active = boss && !boss.felled ? boss : null;
    if (active) active.deaths = Math.max(0, active.deaths + amount);
    this.log.push({ t: Date.now() / 1000, amount, source, boss: active?.name ?? null });
    this.log.splice(0, Math.max(0, this.log.length - MAX_LOG));
    if (amount > 0) this.emit("death", { total: this.total(), amount });
  }

  private newBoss(name: string, great = false, region = ""): Boss {
    return { id: randomUUID().slice(0, 10), name, great, region, deaths: 0, felled: false, felledAt: null };
  }

  /** Apply an action from the app window or a Stream Deck shortcut. Throws Error with a readable message. */
  apply(action: Action) {
    switch (action.type) {
      case "deathAdd": {
        const amount = Math.round(action.amount ?? 1);
        if (amount < 1 || amount > 50) throw new Error("Anzahl muss zwischen 1 und 50 liegen.");
        this.offset += amount;
        this.sessionManual += amount;
        this.register(amount, "manual");
        break;
      }
      case "deathRemove":
        if (this.total() <= 0) throw new Error("Der Zähler steht bereits auf null.");
        this.offset -= 1;
        if (this.session() > 0) this.sessionManual -= 1;
        this.register(-1, "manual");
        break;
      case "setTotal": {
        const value = Math.round(action.value);
        if (!(value >= 0 && value <= 999999)) throw new Error("Wert muss zwischen 0 und 999999 liegen.");
        this.offset = value - (this.saveTotal ?? this.lastSaveTotal ?? 0);
        break;
      }
      case "sessionNew":
        this.sessionStarted = Date.now() / 1000;
        this.sessionSave = this.sessionManual = 0;
        this.log = [];
        break;
      case "bossSet": {
        if (action.id === null) {
          this.currentBoss = null;
          break;
        }
        const boss = this.boss(action.id);
        if (!boss) throw new Error("Boss nicht gefunden.");
        boss.felled = false;
        boss.felledAt = null;
        this.currentBoss = boss.id;
        break;
      }
      case "bossAdd": {
        const name = action.name.trim().slice(0, 80);
        if (!name) throw new Error("Bitte einen Namen eingeben.");
        const boss = this.newBoss(name, action.great, action.region?.trim().slice(0, 60));
        this.bosses.push(boss);
        if (action.select) this.currentBoss = boss.id;
        break;
      }
      case "bossUpdate": {
        const boss = this.boss(action.id);
        if (!boss) throw new Error("Boss nicht gefunden.");
        if (action.name !== undefined) {
          if (!action.name.trim()) throw new Error("Der Name darf nicht leer sein.");
          boss.name = action.name.trim().slice(0, 80);
        }
        if (action.region !== undefined) boss.region = action.region.trim().slice(0, 60);
        if (action.great !== undefined) boss.great = action.great;
        if (action.deaths !== undefined) boss.deaths = Math.max(0, Math.min(99999, Math.round(action.deaths)));
        break;
      }
      case "bossRemove":
        this.bosses = this.bosses.filter((b) => b.id !== action.id);
        if (this.currentBoss === action.id) this.currentBoss = null;
        break;
      case "bossFelled": {
        const boss = this.boss(action.id ?? this.currentBoss);
        if (!boss) throw new Error("Kein Boss ausgewählt.");
        boss.felled = true;
        boss.felledAt = Date.now() / 1000;
        if (this.currentBoss === boss.id) this.currentBoss = null;
        break;
      }
      case "bossRevive": {
        const boss = this.boss(action.id);
        if (!boss) throw new Error("Boss nicht gefunden.");
        boss.felled = false;
        boss.felledAt = null;
        break;
      }
      case "bossesReset":
        for (const boss of this.bosses) Object.assign(boss, { deaths: 0, felled: false, felledAt: null });
        this.currentBoss = null;
        break;
      case "settings":
        this.settings = clampSettings(deepMerge(structuredClone(this.settings), action.patch));
        break;
      case "settingsReset":
        this.settings = structuredClone(DEFAULT_SETTINGS);
        break;
      case "slotSet":
        this.slotPinned = action.slot !== null;
        if (action.slot !== this.slot && action.slot !== null) {
          this.slot = action.slot;
          this.offset = 0;
          this.rebase();
          this.poll();
        }
        break;
      default:
        throw new Error("Unbekannte Aktion.");
    }
    this.changed();
  }
}
