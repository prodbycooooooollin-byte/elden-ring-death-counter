"""Build dist/death-counter-<version>.zip plus a .sha256 file for the updater.

    py -3 tools/build_release.py --exe-dir PATH\\TO\\pyinstaller\\dist\\DeathCounter

--exe-dir adds DeathCounter.exe and its _internal runtime (built from launcher/launcher.py with
PyInstaller: --windowed --onedir --name DeathCounter --icon launcher/emblem.ico).
"""

import argparse
import hashlib
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ["app", "web", "assets/LIESMICH.txt", "assets/QUELLEN.md", "death_counter.py", "README.md", "VERSION"]


def files(base, entries):
    for entry in entries:
        path = base / entry
        if path.is_file():
            yield path
        elif path.is_dir():
            for item in sorted(path.rglob("*")):
                if item.is_file() and "__pycache__" not in item.parts:
                    yield item


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe-dir", type=Path, help="PyInstaller output folder containing DeathCounter.exe")
    args = parser.parse_args()
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    target = dist / f"death-counter-{version}.zip"
    folder = f"DeathCounter-{version}"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in files(ROOT, INCLUDE):
            bundle.write(path, f"{folder}/{path.relative_to(ROOT).as_posix()}")
        if args.exe_dir:
            if not (args.exe_dir / "DeathCounter.exe").is_file():
                raise SystemExit("DeathCounter.exe nicht gefunden.")
            for path in files(args.exe_dir, ["DeathCounter.exe", "_internal"]):
                bundle.write(path, f"{folder}/{path.relative_to(args.exe_dir).as_posix()}")
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (dist / f"{target.name}.sha256").write_text(f"{digest}  {target.name}\n", encoding="utf-8")
    print(target, digest)


if __name__ == "__main__":
    main()
