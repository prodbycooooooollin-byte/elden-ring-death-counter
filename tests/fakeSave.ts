// Builds a minimal ER0000.sl2 the parser accepts. Variable tables are empty, so the death
// count lands where the parser computes it for an empty slot.

import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { OCCUPIED_SLOTS, SLOT_BASE, SLOT_COUNT, SLOT_PAYLOAD_SIZE, SLOT_STRIDE, SUMMARY_BASE, SUMMARY_SIZE } from "../src/main/save/parser";

function deathsOffset() {
  let offset = 0x20 + 0x1400 * 8;
  offset += 0xb4 + 2 + 10 + 0x18 + 0x21 + 2 + 0x15 + 6 * 18 + 0x34 + 13 * 16 + 88 + 28 + 88 + 88 + 16 + 12 * (2688 + 384) + 116 + 140 + 24;
  offset += 4; // empty projectile list
  offset += 156 + 12 + 303 + 16 + 12 * (0x780 + 0x80) + 256;
  offset += 4;
  offset += 40 + 1 + 68 + 8 + 4;
  offset += 4;
  offset += 52 + 0x1b588 + 4;
  offset += 4;
  return offset + 3;
}

export type FakeCharacter = [name: string, level: number, playtime: number, deaths: number];

export function buildSave(characters: Record<number, FakeCharacter>) {
  const data = Buffer.alloc(SUMMARY_BASE + SLOT_COUNT * SUMMARY_SIZE + 0x100);
  data.write("BND4", 0, "latin1");
  const at = deathsOffset();
  for (const [slotText, [name, level, playtime, deaths]] of Object.entries(characters)) {
    const slot = Number(slotText);
    const start = SLOT_BASE + (slot - 1) * SLOT_STRIDE;
    const payload = Buffer.alloc(SLOT_PAYLOAD_SIZE);
    payload.writeUInt32LE(deaths, at);
    payload.copy(data, start + 16);
    createHash("md5").update(payload).digest().copy(data, start);
    data[OCCUPIED_SLOTS + slot - 1] = 1;
    const summary = SUMMARY_BASE + (slot - 1) * SUMMARY_SIZE;
    Buffer.from(name, "utf16le").subarray(0, 32).copy(data, summary);
    data.writeUInt32LE(level, summary + 34);
    data.writeUInt32LE(playtime, summary + 38);
  }
  return data;
}

export function writeSave(path: string, characters: Record<number, FakeCharacter>) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, buildSave(characters));
  renameSync(`${path}.tmp`, path);
}
