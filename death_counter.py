"""Read Elden Ring character deaths and publish plain text for OBS."""

import argparse
from dataclasses import dataclass
import hashlib
import os
from pathlib import Path
import struct
import sys
import tempfile
import time


SLOT_COUNT = 10
SLOT_PAYLOAD_SIZE = 0x280000
SLOT_STRIDE = SLOT_PAYLOAD_SIZE + 16
SLOT_BASE = 0x300
OCCUPIED_SLOTS = 0x1901D04
SUMMARY_BASE = 0x1901D0E
SUMMARY_SIZE = 0x24C


class SaveError(ValueError):
    pass


@dataclass(frozen=True)
class Character:
    slot: int
    name: str
    level: int
    playtime: int


def read_u32(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


def list_characters(data):
    if data[:4] != b"BND4" or len(data) < SUMMARY_BASE + SLOT_COUNT * SUMMARY_SIZE:
        raise SaveError("Kein unterstützter Elden-Ring-PC-Spielstand.")
    flags = data[OCCUPIED_SLOTS:OCCUPIED_SLOTS + SLOT_COUNT]
    if any(flag not in (0, 1) for flag in flags):
        raise SaveError("Ungültige Slot-Markierungen im Spielstand.")
    for index, occupied in enumerate(flags):
        if occupied:
            summary = SUMMARY_BASE + index * SUMMARY_SIZE
            name = data[summary:summary + 34].decode("utf-16-le", errors="replace")
            yield Character(index + 1, name.split("\0", 1)[0],
                            read_u32(data, summary + 34), read_u32(data, summary + 38))


def read_deaths(data, slot):
    start = SLOT_BASE + (slot - 1) * SLOT_STRIDE
    payload = memoryview(data)[start + 16:start + SLOT_STRIDE]
    if hashlib.md5(payload, usedforsecurity=False).digest() != data[start:start + 16]:
        raise SaveError(f"Prüfsumme für Slot {slot} ungültig. Warte auf einen vollständigen Spielstand.")

    # The GA item table precedes the player data and has variable-width records.
    offset = 0x20
    for _ in range(0x1400):
        handle = read_u32(payload, offset)
        item_type = handle & 0xF0000000
        offset += 8
        if handle and item_type != 0xC0000000:
            offset += 8
            if item_type == 0x80000000:
                offset += 5

    # Player data, settings, equipment, carried inventory and equipped items.
    offset += (0xB4 + 2 + 10 + 0x18 + 0x21 + 2 + 0x15 + 6 * 18 + 0x34
               + 13 * 16 + 88 + 28 + 88 + 88 + 16 + 12 * (2688 + 384)
               + 116 + 140 + 24)
    # Projectiles, appearance, storage and gestures precede the region list.
    offset = skip_array(payload, offset, 8)
    offset += 156 + 12 + 303 + 16 + 12 * (0x780 + 0x80) + 256
    offset = skip_array(payload, offset, 4)
    # Mount and bloodstain data, then the variable menu and tutorial blobs.
    offset += 40 + 1 + 68 + 8 + 4
    offset = skip_array(payload, offset, 1)
    offset += 52 + 0x1B588 + 4
    offset = skip_array(payload, offset, 1)
    return checked_u32(payload, offset + 3)


def checked_u32(data, offset):
    if offset + 4 > len(data):
        raise SaveError("Unerwartetes Layout im Charakter-Slot.")
    return read_u32(data, offset)


def skip_array(data, offset, item_size):
    return offset + 4 + checked_u32(data, offset) * item_size


def save_stamp(stat):
    return stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns


def read_snapshot(path):
    path_before = save_stamp(path.stat())
    with path.open("rb") as stream:
        before = save_stamp(os.fstat(stream.fileno()))
        data = stream.read()
        after = save_stamp(os.fstat(stream.fileno()))
    path_after = save_stamp(path.stat())
    if before != after or path_before != path_after or len(data) != path_after[1]:
        raise SaveError("Spielstand wird gerade aktualisiert.")
    return data, path_after


def write_count(path, count):
    value = str(count).encode("ascii")
    try:
        if path.read_bytes() == value:
            return
    except FileNotFoundError:
        pass
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp_path = Path(temp.name)
        try:
            temp.write(value)
            temp.close()
            temp_path.replace(path)
        finally:
            temp_path.unlink(missing_ok=True)


def watch(path, output, requested_slot):
    output.mkdir(parents=True, exist_ok=True)
    print(f"Spielstand: {path}\nOBS-Dateien: {output}", flush=True)
    stamp = previous = last_error = None
    session = 0
    while True:
        try:
            if stamp != save_stamp(path.stat()):
                data, next_stamp = read_snapshot(path)
                characters = {character.slot: character for character in list_characters(data)}
                if not characters:
                    raise SaveError("Im Spielstand ist noch kein Charakter vorhanden.")
                if requested_slot is None:
                    if len(characters) > 1:
                        print_slots(data)
                        raise SystemExit("Mehrere Charaktere. Bitte mit --slot NUMMER starten.")
                    requested_slot = next(iter(characters))
                if requested_slot not in characters:
                    raise SaveError(f"Slot {requested_slot} ist leer.")
                character = characters[requested_slot]
                total = read_deaths(data, requested_slot)
                next_session = session
                if previous is not None:
                    old_character, old_total = previous
                    if character.name != old_character.name:
                        raise SystemExit("Der Charaktername im gewählten Slot hat sich geändert. Bitte neu starten.")
                    if character.playtime >= old_character.playtime:
                        next_session += max(0, total - old_total)
                write_count(output / "deaths_total.txt", total)
                write_count(output / "deaths_session.txt", next_session)
                if previous is None or (total, next_session) != (previous[1], session):
                    print(f"Slot {requested_slot} ({character.name}) | Gesamt {total} | Session {next_session}",
                          flush=True)
                stamp, previous, session = next_stamp, (character, total), next_session
            last_error = None
        except (OSError, SaveError) as error:
            if str(error) != last_error:
                print(str(error), file=sys.stderr, flush=True)
                last_error = str(error)
        time.sleep(1)


def print_slots(data):
    for character in list_characters(data):
        print(f"Slot {character.slot} | {character.name} | Level {character.level}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--save", type=Path, help="Pfad zum PC-Spielstand")
    parser.add_argument("--list", action="store_true", help="Charakter-Slots anzeigen und beenden")
    parser.add_argument("--slot", type=int, choices=range(1, 11), metavar="1-10")
    args = parser.parse_args()
    path = args.save
    if path is None:
        appdata = os.environ.get("APPDATA")
        candidates = sorted((Path(appdata) / "EldenRing").glob("*/ER0000.sl2")) if appdata else []
        if len(candidates) != 1:
            if candidates:
                print(*(str(candidate) for candidate in candidates), sep="\n")
            parser.error('Kein eindeutiger Spielstand. Bitte --save "PFAD\\ER0000.sl2" angeben.')
        path = candidates[0]
    if not path.is_file():
        parser.error(f"Spielstand nicht gefunden: {path}")
    output = Path(__file__).resolve().parent / "obs-data"
    if path.resolve() in {(output / name).resolve() for name in ("deaths_total.txt", "deaths_session.txt")}:
        parser.error("Der Spielstand darf keine OBS-Ausgabedatei sein.")
    try:
        if args.list:
            print_slots(read_snapshot(path)[0])
        else:
            watch(path, output, args.slot)
    except (OSError, SaveError) as error:
        parser.exit(1, f"{error}\n")
    except KeyboardInterrupt:
        print("\nDeath Counter beendet.")


if __name__ == "__main__":
    main()
