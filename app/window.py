"""Open the control panel as its own app window (Edge or Chrome in --app mode)."""

import os
from pathlib import Path
import shutil
import socket
import subprocess
import webbrowser


def _candidates():
    roots = [os.environ.get(name) for name in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA")]
    for root in filter(None, roots):
        yield Path(root) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
        yield Path(root) / "Google" / "Chrome" / "Application" / "chrome.exe"
    for name in ("msedge", "chrome"):
        found = shutil.which(name)
        if found:
            yield Path(found)


def open_app_window(url, size=(1320, 880)):
    """Show `url` in a browser window without tabs or address bar; fall back to the default browser."""
    for exe in _candidates():
        if exe.is_file():
            try:
                subprocess.Popen([str(exe), f"--app={url}", f"--window-size={size[0]},{size[1]}"],
                                 creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
                return True
            except OSError:
                continue
    webbrowser.open(url)
    return False


def server_running(port, host="127.0.0.1"):
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False
