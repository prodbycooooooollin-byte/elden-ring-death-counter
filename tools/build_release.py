"""Build dist/death-counter-<version>.zip plus a .sha256 file for the updater."""

import hashlib
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
INCLUDE = ["app", "web", "tests", "tools", "assets/LIESMICH.txt", "assets/QUELLEN.md",
           "death_counter.py", "start_counter.cmd", "README.md", "VERSION"]


def files():
    for entry in INCLUDE:
        path = ROOT / entry
        if path.is_file():
            yield path
        else:
            for item in sorted(path.rglob("*")):
                if item.is_file() and "__pycache__" not in item.parts:
                    yield item


def main():
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    target = dist / f"death-counter-{version}.zip"
    folder = f"elden-ring-death-counter-{version}"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as bundle:
        for path in files():
            bundle.write(path, f"{folder}/{path.relative_to(ROOT).as_posix()}")
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (dist / f"{target.name}.sha256").write_text(f"{digest}  {target.name}\n", encoding="utf-8")
    print(target, digest)


if __name__ == "__main__":
    main()
