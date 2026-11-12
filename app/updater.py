"""Self-update from GitHub releases.

The app checks the latest release of REPO, downloads its zip asset, verifies the
SHA-256 checksum published next to it, replaces only program files and restarts.
Folders with user data (data/, obs-data/, assets/) are never touched.
"""

import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile

REPO = "prodbycooooooollin-byte/elden-ring-death-counter"
ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "VERSION"
PROTECTED = {"data", "obs-data", "assets", ".git", ".claude", "dist"}
USER_AGENT = "elden-ring-death-counter-updater"
CHECK_EVERY = 6 * 3600


def current_version():
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return "0.0.0"


def parse(version):
    parts = []
    for piece in version.lstrip("vV").split("."):
        digits = "".join(ch for ch in piece if ch.isdigit())
        parts.append(int(digits or 0))
    return tuple((parts + [0, 0, 0])[:3])


def _get(url, accept="application/vnd.github+json", timeout=20):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


class Updater:
    def __init__(self, tracker):
        self.tracker = tracker
        self.lock = threading.Lock()
        self.info = {"current": current_version(), "latest": None, "available": False,
                     "status": "idle", "message": "", "url": None}
        self._asset = None
        self._checksum = None
        tracker.updater = self

    def public(self):
        with self.lock:
            return dict(self.info)

    def _set(self, **changes):
        with self.lock:
            self.info.update(changes)
        self.tracker.broadcast()

    # ---------- checking ----------

    def check(self):
        self._set(status="checking", message="")
        try:
            release = json.loads(_get(f"https://api.github.com/repos/{REPO}/releases/latest"))
            tag = release.get("tag_name") or ""
            assets = {a["name"]: a["browser_download_url"] for a in release.get("assets", [])}
            zip_name = next((n for n in assets if n.endswith(".zip")), None)
            self._asset = assets.get(zip_name) if zip_name else None
            self._checksum = assets.get(f"{zip_name}.sha256") if zip_name else None
            available = bool(self._asset) and parse(tag) > parse(current_version())
            self._set(status="idle", latest=tag.lstrip("vV"), available=available, url=release.get("html_url"))
            return available
        except Exception as error:  # network down, rate limit, no release yet
            self._set(status="error", message=str(error)[:200])
            return False

    def check_async(self):
        threading.Thread(target=self.check, name="update-check", daemon=True).start()

    # ---------- installing ----------

    def install(self):
        if not self._asset and not self.check():
            return
        self._set(status="installing", message="")
        try:
            archive = _get(self._asset, accept="application/octet-stream", timeout=120)
            if self._checksum:
                expected = _get(self._checksum, accept="application/octet-stream").decode().split()[0].lower()
                if hashlib.sha256(archive).hexdigest() != expected:
                    raise ValueError("Prüfsumme des Downloads stimmt nicht.")
            self._apply(archive)
        except Exception as error:
            self._set(status="error", message=f"Installation abgebrochen: {error}"[:240])
            return
        self.restart()

    def install_async(self):
        threading.Thread(target=self.install, name="update-install", daemon=True).start()

    def _apply(self, archive):
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle, tempfile.TemporaryDirectory() as temp:
            for member in bundle.namelist():
                target = (Path(temp) / member).resolve()
                if Path(temp).resolve() not in target.parents and target != Path(temp).resolve():
                    raise ValueError("Unsicherer Pfad im Update-Archiv.")
            bundle.extractall(temp)
            source = Path(temp)
            entries = list(source.iterdir())
            if len(entries) == 1 and entries[0].is_dir():  # zip with a top-level folder
                source = entries[0]
            if not (source / "app" / "__main__.py").is_file():
                raise ValueError("Das Archiv enthält keine gültige App.")
            for item in source.iterdir():
                if item.name in PROTECTED:
                    continue
                destination = ROOT / item.name
                if item.is_dir():
                    shutil.copytree(item, destination, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, destination)

    def restart(self):
        """Start a fresh process with the same arguments and end this one."""
        self.tracker.stop()
        args = [sys.executable, "-m", "app", *sys.argv[1:]]
        if "--no-browser" not in args:
            args.append("--no-browser")
        flags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0) if os.name == "nt" else 0
        subprocess.Popen(args, cwd=str(ROOT), creationflags=flags)
        time.sleep(0.5)
        os._exit(0)

    # ---------- background loop ----------

    def run(self, auto_install_on_start):
        time.sleep(3)
        if self.check() and auto_install_on_start():
            self.install()
        while True:
            time.sleep(CHECK_EVERY)
            self.check()
