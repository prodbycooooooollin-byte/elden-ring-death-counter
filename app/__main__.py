"""Start the death counter web app:  py -3 -m app  [--port 8737] [--save PATH] [--slot N]"""

import argparse
from pathlib import Path
import sys
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.server import Server, make_handler  # noqa: E402
from app.tracker import Tracker  # noqa: E402
from app.updater import Updater, current_version  # noqa: E402
import time  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Elden Ring Death Counter mit OBS-Overlay")
    parser.add_argument("--port", type=int, default=8737)
    parser.add_argument("--host", default="127.0.0.1",
                        help="0.0.0.0 macht das Pult im Heimnetz erreichbar (z. B. vom Handy)")
    parser.add_argument("--save", type=Path, help="Pfad zum PC-Spielstand (ER0000.sl2)")
    parser.add_argument("--slot", type=int, choices=range(1, 11), metavar="1-10")
    parser.add_argument("--no-browser", action="store_true", help="Steuerpult nicht automatisch öffnen")
    args = parser.parse_args()

    tracker = Tracker(ROOT / "data", ROOT / "obs-data", args.save, args.slot)
    updater = Updater(tracker)
    server = None
    for _ in range(20):  # after an update the old process may hold the port for a moment
        try:
            server = Server((args.host, args.port), make_handler(tracker))
            break
        except OSError:
            time.sleep(0.5)
    if server is None:
        parser.exit(1, f"Port {args.port} ist belegt. Läuft der Counter schon? Sonst mit --port 8738 starten.\n")

    watcher = threading.Thread(target=tracker.run, name="save-watcher", daemon=True)
    watcher.start()
    threading.Thread(target=updater.run, args=(lambda: tracker.settings["updates"]["auto_install"],),
                     name="updater", daemon=True).start()
    base = f"http://127.0.0.1:{args.port}"
    print(f"Elden Ring Death Counter {current_version()} läuft.")
    print(f"  Steuerpult:  {base}/control/")
    print(f"  OBS-Overlay: {base}/overlay/   (Browserquelle, 1920 x 1080)")
    print("  Beenden mit Strg+C.", flush=True)
    if not args.no_browser:
        threading.Timer(0.6, webbrowser.open, (f"{base}/control/",)).start()
    try:
        server.serve_forever(poll_interval=0.3)
    except KeyboardInterrupt:
        print("\nDeath Counter beendet.")
    finally:
        tracker.stop()
        watcher.join(timeout=2)
        server.server_close()


if __name__ == "__main__":
    main()
