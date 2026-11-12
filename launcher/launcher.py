"""Entry point of DeathCounter.exe (built with PyInstaller, no console window).

The executable only carries the Python runtime. The program itself (app/, web/) stays as plain
files next to it, so the built-in updater can replace them without rebuilding the .exe.
"""

import importlib
import os
from pathlib import Path
import sys
import traceback

# Standard-library modules the app needs; imported here so PyInstaller bundles them.
import argparse, copy, dataclasses, hashlib, http.server, io, json, mimetypes, queue  # noqa: E401,F401
import shutil, socket, socketserver, struct, subprocess, tempfile, threading, time  # noqa: E401,F401
import urllib.request, uuid, webbrowser, zipfile, email.utils, html, unittest  # noqa: E401,F401

ROOT = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent.parent


def main():
    os.chdir(ROOT)
    (ROOT / "data").mkdir(exist_ok=True)
    log = open(ROOT / "data" / "app.log", "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = log  # windowed exe has no console
    sys.path.insert(0, str(ROOT))
    sys.argv = [sys.argv[0], *(sys.argv[1:] or ["--window"])]
    try:
        importlib.import_module("app.__main__").main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, "Der Death Counter konnte nicht starten.\n"
                                         f"Details stehen in {ROOT / 'data' / 'app.log'}.",
                                         "Death Counter", 0x10)


if __name__ == "__main__":
    main()
