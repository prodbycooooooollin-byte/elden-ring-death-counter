"""Start the death counter:  py -3 -m app  [--port 8737] [--save PATH] [--slot N] [--window]

--window is what DeathCounter.exe uses: the control panel opens as its own app window, a second
start only brings that window back, and the counter ends on its own once neither the window nor
an OBS overlay has been connected for a while.
"""

import argparse
from pathlib import Path
import sys
import threading
import time
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.server import Server, make_handler  # noqa: E402
from app.tracker import Tracker  # noqa: E402
from app.updater import Updater, current_version  # noqa: E402
from app.window import open_app_window, server_running  # noqa: E402

IDLE_EXIT_SECONDS = 45      # nobody connected (no window, no OBS): end the background process
START_GRACE_SECONDS = 90    # time for the window to open after start


def watch_idle(tracker, server):
    started = time.time()
    idle_since = None
    while True:
        time.sleep(3)
        if tracker.hub.client_count() > 0 or time.time() - started < START_GRACE_SECONDS:
            idle_since = None
            continue
        idle_since = idle_since or time.time()
        if time.time() - idle_since > IDLE_EXIT_SECONDS:
            print("Kein Fenster und kein Overlay mehr verbunden. Death Counter beendet sich.", flush=True)
            server.shutdown()
            return


def main():
    parser = argparse.ArgumentParser(description="Elden Ring Death Counter mit OBS-Overlay")
    parser.add_argument("--port", type=int, default=8737)
    parser.add_argument("--host", default="127.0.0.1",
                        help="0.0.0.0 macht das Pult im Heimnetz erreichbar (z. B. vom Handy)")
    parser.add_argument("--save", type=Path, help="Pfad zum PC-Spielstand (ER0000.sl2)")
    parser.add_argument("--slot", type=int, choices=range(1, 11), metavar="1-10")
    parser.add_argument("--no-browser", action="store_true", help="Steuerpult nicht automatisch öffnen")
    parser.add_argument("--window", action="store_true", help="Steuerpult als eigenes App-Fenster öffnen")
    parser.add_argument("--no-open", action="store_true", help="mit --window: Fenster nicht öffnen (Neustart nach Update)")
    args = parser.parse_args()
    base = f"http://127.0.0.1:{args.port}"

    if args.window and not args.no_open and server_running(args.port):
        # Already running in the background: just bring up the window.
        open_app_window(f"{base}/control/")
        return

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
    tracker.on_quit = server.shutdown

    watcher = threading.Thread(target=tracker.run, name="save-watcher", daemon=True)
    watcher.start()
    threading.Thread(target=updater.run, args=(lambda: tracker.settings["updates"]["auto_install"],),
                     name="updater", daemon=True).start()
    print(f"Elden Ring Death Counter {current_version()} läuft.")
    print(f"  Steuerpult:  {base}/control/")
    print(f"  OBS-Overlay: {base}/overlay/   (Browserquelle, 1920 x 1080)", flush=True)
    if args.window:
        threading.Thread(target=watch_idle, args=(tracker, server), name="idle", daemon=True).start()
        if not args.no_open:
            threading.Timer(0.4, open_app_window, (f"{base}/control/",)).start()
    elif not args.no_browser:
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
