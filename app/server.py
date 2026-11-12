"""Local HTTP server: static web UI, JSON API, server-sent events and Stream Deck shortcuts."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import queue
import sys
from urllib.parse import urlsplit

WEB_ROOT = Path(__file__).resolve().parent.parent / "web"
ASSET_ROOT = Path(__file__).resolve().parent.parent / "assets"

# Files the streamer may drop into ./assets to replace the built-in look and sound.
ASSET_SLOTS = {
    "font-display": (".woff2", ".woff", ".ttf", ".otf"),
    "font-text": (".woff2", ".woff", ".ttf", ".otf"),
    "icon": (".png", ".webp"),
    "plate": (".png", ".webp", ".jpg"),
    "banner": (".png", ".webp", ".jpg"),
    "death": (".mp3", ".ogg", ".wav"),
    "felled": (".mp3", ".ogg", ".wav"),
    "boss": (".mp3", ".ogg", ".wav"),
}
ASSET_TYPES = {".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
               ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
               ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav"}


def list_assets():
    found = {}
    for slot, extensions in ASSET_SLOTS.items():
        for ext in extensions:
            path = ASSET_ROOT / f"{slot}{ext}"
            if path.is_file():
                found[slot] = f"/assets/{slot}{ext}?v={path.stat().st_mtime_ns}"
                break
    return found

# GET shortcuts for Stream Deck ("Website" action, open in background) or bots.
QUICK_ACTIONS = {
    "add": {"type": "death_add", "amount": 1},
    "undo": {"type": "death_remove"},
    "felled": {"type": "boss_felled"},
    "session": {"type": "session_new"},
}

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")


def make_handler(tracker):
    class Handler(BaseHTTPRequestHandler):
        server_version = "GraceCounter/1.0"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):
            pass  # keep the terminal clean for the tracker output

        # ----- helpers -----

        def _send(self, status, body=b"", content_type="application/json; charset=utf-8", extra=None):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            for key, value in (extra or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status, payload):
            self._send(status, json.dumps(payload, ensure_ascii=False).encode("utf-8"))

        def _same_origin(self):
            # Blocks other websites in your browser from changing the counter.
            origin = self.headers.get("Origin")
            if not origin:
                return True
            host = self.headers.get("Host", "")
            return urlsplit(origin).netloc == host

        def _body(self, limit):
            length = int(self.headers.get("Content-Length") or 0)
            if length > limit:
                raise ValueError("Anfrage zu groß.")
            return self.rfile.read(length) if length else b""

        # ----- routes -----

        def do_HEAD(self):
            self.do_GET()

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == "/api/state":
                return self._json(200, tracker.public_state())
            if path == "/api/events":
                return self._events()
            if path.startswith("/api/quick/"):
                action = QUICK_ACTIONS.get(path.rsplit("/", 1)[-1])
                if not action:
                    return self._json(404, {"error": "Unbekannter Kurzbefehl."})
                try:
                    tracker.apply(dict(action))
                except ValueError as error:
                    return self._json(400, {"error": str(error)})
                return self._json(200, {"ok": True})
            if path == "/api/assets":
                return self._json(200, list_assets())
            if path.startswith("/assets/"):
                name = path[len("/assets/"):]
                stem, _, ext = name.rpartition(".")
                target = ASSET_ROOT / name
                if stem not in ASSET_SLOTS or f".{ext}" not in ASSET_SLOTS[stem] or not target.is_file():
                    return self._send(404, b"", "text/plain")
                return self._send(200, target.read_bytes(), ASSET_TYPES[f".{ext}"])
            if path.startswith("/game/"):
                # Original game icons shipped in assets/game (see assets/QUELLEN.md).
                name = path[len("/game/"):]
                target = (ASSET_ROOT / "game" / name).resolve()
                ext = target.suffix.lower()
                if target.parent != (ASSET_ROOT / "game").resolve() or ext not in (".png", ".webp", ".jpg")                         or not target.is_file():
                    return self._send(404, b"", "text/plain")
                return self._send(200, target.read_bytes(), ASSET_TYPES[ext])
            if path == "/media/logo":
                logo = tracker.logo_path()
                if not logo:
                    return self._send(404, b"", "text/plain")
                return self._send(200, logo.read_bytes(), mimetypes.guess_type(logo.name)[0] or "image/png")
            if path in ("/", ""):
                return self._send(302, b"", "text/plain", {"Location": "/control/"})
            return self._static(path)

        def do_POST(self):
            path = urlsplit(self.path).path
            if not self._same_origin():
                return self._json(403, {"error": "Fremde Herkunft abgelehnt."})
            try:
                if path == "/api/action":
                    action = json.loads(self._body(64 * 1024) or b"{}")
                    result = tracker.apply(action)
                    return self._json(200, {"ok": True, "result": result})
                if path == "/api/logo":
                    content_type = (self.headers.get("Content-Type") or "").split(";")[0].strip()
                    tracker.set_logo(content_type, self._body(6 * 1024 * 1024))
                    return self._json(200, {"ok": True})
            except (ValueError, TypeError) as error:
                return self._json(400, {"error": str(error)})
            return self._json(404, {"error": "Nicht gefunden."})

        def do_DELETE(self):
            if not self._same_origin():
                return self._json(403, {"error": "Fremde Herkunft abgelehnt."})
            if urlsplit(self.path).path == "/api/logo":
                tracker.clear_logo()
                return self._json(200, {"ok": True})
            return self._json(404, {"error": "Nicht gefunden."})

        def _static(self, path):
            target = (WEB_ROOT / path.lstrip("/")).resolve()
            if WEB_ROOT not in target.parents and target != WEB_ROOT:
                return self._send(404, b"Not found", "text/plain")
            if target.is_dir():
                if not path.endswith("/"):
                    return self._send(301, b"", "text/plain", {"Location": path + "/"})
                target = target / "index.html"
            if not target.is_file():
                return self._send(404, b"Not found", "text/plain")
            content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type.endswith(("javascript", "svg+xml")):
                content_type += "; charset=utf-8"
            self._send(200, target.read_bytes(), content_type)

        def _events(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            q = tracker.hub.subscribe()
            try:
                self._emit("state", tracker.public_state())
                while True:
                    try:
                        kind, payload = q.get(timeout=15)
                        self._emit(kind, payload)
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                pass
            finally:
                tracker.hub.unsubscribe(q)
                self.close_connection = True

        def _emit(self, kind, payload):
            data = json.dumps(payload, ensure_ascii=False)
            self.wfile.write(f"event: {kind}\ndata: {data}\n\n".encode("utf-8"))
            self.wfile.flush()

    return Handler


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        # A closed browser tab or OBS source drops its connection: not worth a traceback.
        error = sys.exc_info()[1]
        if isinstance(error, (ConnectionError, TimeoutError)):
            return
        super().handle_error(request, client_address)
