// Reads characters and their death counts from an Elden Ring PC save (ER0000.sl2 / .co2).
// Ported 1:1 from the original death_counter.py. The layout follows the save parser of
// EldenRingDeathCounterOBS (froagkey) and the SaveForge parameter reference (oisis).

import { createHash } from "node:crypto";

export const SLOT_COUNT = 10;
export const SLOT_PAYLOAD_SIZE = 0x280000;
export const SLOT_STRIDE = SLOT_PAYLOAD_SIZE + 16;
export const SLOT_BASE = 0x300;
export const OCCUPIED_SLOTS = 0x1901d04;
export const SUMMARY_BASE = 0x1901d0e;
export const SUMMARY_SIZE = 0x24c;

export class SaveError extends Error {}

export interface Character {
  slot: number;
  name: string;
  level: number;
  playtime: number; // seconds
}

const u32 = (data: Buffer, offset: number) => data.readUInt32LE(offset);

export function listCharacters(data: Buffer): Character[] {
  if (data.subarray(0, 4).toString("latin1") !== "BND4" || data.length < SUMMARY_BASE + SLOT_COUNT * SUMMARY_SIZE) {
    throw new SaveError("Kein unterstützter Elden-Ring-PC-Spielstand.");
  }
  const flags = data.subarray(OCCUPIED_SLOTS, OCCUPIED_SLOTS + SLOT_COUNT);
  if (flags.some((flag) => flag !== 0 && flag !== 1)) throw new SaveError("Ungültige Slot-Markierungen im Spielstand.");
  const characters: Character[] = [];
  flags.forEach((occupied, index) => {
    if (!occupied) return;
    const summary = SUMMARY_BASE + index * SUMMARY_SIZE;
    const name = data.subarray(summary, summary + 34).toString("utf16le").split("\0")[0];
    characters.push({ slot: index + 1, name, level: u32(data, summary + 34), playtime: u32(data, summary + 38) });
  });
  return characters;
}

function checkedU32(data: Buffer, offset: number) {
  if (offset + 4 > data.length) throw new SaveError("Unerwartetes Layout im Charakter-Slot.");
  return u32(data, offset);
}

function skipArray(data: Buffer, offset: number, itemSize: number) {
  return offset + 4 + checkedU32(data, offset) * itemSize;
}

export function readDeaths(data: Buffer, slot: number): number {
  const start = SLOT_BASE + (slot - 1) * SLOT_STRIDE;
  const payload = data.subarray(start + 16, start + SLOT_STRIDE);
  const digest = createHash("md5").update(payload).digest();
  if (!digest.equals(data.subarray(start, start + 16))) {
    throw new SaveError(`Prüfsumme für Slot ${slot} ungültig. Warte auf einen vollständigen Spielstand.`);
  }

  // The GA item table precedes the player data and has variable-width records.
  let offset = 0x20;
  for (let i = 0; i < 0x1400; i++) {
    const handle = u32(payload, offset);
    const itemType = (handle & 0xf0000000) >>> 0;
    offset += 8;
    if (handle && itemType !== 0xc0000000) {
      offset += 8;
      if (itemType === 0x80000000) offset += 5;
    }
  }
  // Player data, settings, equipment, carried inventory and equipped items.
  offset += 0xb4 + 2 + 10 + 0x18 + 0x21 + 2 + 0x15 + 6 * 18 + 0x34
    + 13 * 16 + 88 + 28 + 88 + 88 + 16 + 12 * (2688 + 384)
    + 116 + 140 + 24;
  // Projectiles, appearance, storage and gestures precede the region list.
  offset = skipArray(payload, offset, 8);
  offset += 156 + 12 + 303 + 16 + 12 * (0x780 + 0x80) + 256;
  offset = skipArray(payload, offset, 4);
  // Mount and bloodstain data, then the variable menu and tutorial blobs.
  offset += 40 + 1 + 68 + 8 + 4;
  offset = skipArray(payload, offset, 1);
  offset += 52 + 0x1b588 + 4;
  offset = skipArray(payload, offset, 1);
  return checkedU32(payload, offset + 3);
}
