"""Build a minimal ER0000.sl2 that the parser in death_counter.py accepts (for tests only).

All variable-length tables are empty, so the death count lands at the offset the parser
computes for an empty slot. Real saves differ in content but not in how the parser walks them.
"""

import hashlib
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import death_counter as dc  # noqa: E402


def deaths_offset():
    payload = bytearray(dc.SLOT_PAYLOAD_SIZE)
    # Walk exactly like read_deaths, on an all-zero payload.
    offset = 0x20 + 0x1400 * 8
    offset += (0xB4 + 2 + 10 + 0x18 + 0x21 + 2 + 0x15 + 6 * 18 + 0x34
               + 13 * 16 + 88 + 28 + 88 + 88 + 16 + 12 * (2688 + 384)
               + 116 + 140 + 24)
    offset = dc.skip_array(payload, offset, 8)
    offset += 156 + 12 + 303 + 16 + 12 * (0x780 + 0x80) + 256
    offset = dc.skip_array(payload, offset, 4)
    offset += 40 + 1 + 68 + 8 + 4
    offset = dc.skip_array(payload, offset, 1)
    offset += 52 + 0x1B588 + 4
    offset = dc.skip_array(payload, offset, 1)
    return offset + 3


DEATHS_AT = deaths_offset()


def build(characters):
    """characters: {slot: (name, level, playtime_seconds, deaths)}"""
    size = dc.SUMMARY_BASE + dc.SLOT_COUNT * dc.SUMMARY_SIZE + 0x100
    data = bytearray(size)
    data[:4] = b"BND4"
    for slot, (name, level, playtime, deaths) in characters.items():
        start = dc.SLOT_BASE + (slot - 1) * dc.SLOT_STRIDE
        payload = bytearray(dc.SLOT_PAYLOAD_SIZE)
        struct.pack_into("<I", payload, DEATHS_AT, deaths)
        data[start + 16:start + dc.SLOT_STRIDE] = payload
        data[start:start + 16] = hashlib.md5(payload).digest()
        data[dc.OCCUPIED_SLOTS + slot - 1] = 1
        summary = dc.SUMMARY_BASE + (slot - 1) * dc.SUMMARY_SIZE
        encoded = name.encode("utf-16-le")[:32]
        data[summary:summary + len(encoded)] = encoded
        struct.pack_into("<II", data, summary + 34, level, playtime)
    return bytes(data)


def write(path, characters):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_bytes(build(characters))
    temp.replace(path)


if __name__ == "__main__":
    # Usage: fake_save.py PATH "slot:name:level:playtime:deaths" ...
    chars = {}
    for spec in sys.argv[2:]:
        slot, name, level, playtime, deaths = spec.split(":")
        chars[int(slot)] = (name, int(level), int(playtime), int(deaths))
    write(sys.argv[1], chars)
