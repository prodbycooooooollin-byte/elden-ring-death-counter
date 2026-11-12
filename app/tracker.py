"""Tracker state: save-file watcher, manual corrections, bosses, settings and persistence."""

import copy
import json
import os
from pathlib import Path
import queue
import threading
import time
import uuid

import death_counter as dc
from app import game_assets
from app.bosses import PRESETS


DEFAULT_SETTINGS = {
    "language": "de",
    "overlay": {
        "layout": "emblem",         # emblem | hud | bossbar | compact
        "position": "tr",           # tl | tr | bl | br  (top-left holds the game's HP bars)
        "scale": 100,               # percent
        "label": "",                # empty = language default
        "show_total": True,
        "show_session": False,
        "show_boss": False,
        "show_rate": False,
        "show_timer": False,
        "show_icon": True,
        "show_logo": False,
        "backdrop": 45,             # opacity of the dark band behind the counter, percent
    },
    "banners": {
        "you_died": True,
        "you_died_text": "YOU DIED",
        "felled": True,
        "boss_intro": True,
        "duration": 4.5,            # seconds
    },
    "sound": {"enabled": False, "volume": 55},
    "session": {"reset_on_start": True},
    "updates": {"auto_install": True},
}

MAX_LOG = 300


def merge(defaults, patch):
    """Return defaults updated with patch, keeping only known keys and their types."""
    result = copy.deepcopy(defaults)
    if not isinstance(patch, dict):
        return result
    for key, default in defaults.items():
        if key not in patch:
            continue
        value = patch[key]
        if isinstance(default, dict):
            result[key] = merge(default, value)
        elif isinstance(default, bool):
            if isinstance(value, bool):
                result[key] = value
        elif isinstance(default, (int, float)):
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                result[key] = type(default)(value) if isinstance(default, float) else value
        elif isinstance(default, str):
            if isinstance(value, str):
                result[key] = value[:120]
    return result


def clamp_settings(settings):
    o = settings["overlay"]
    o["layout"] = {"plate": "hud", "crest": "compact"}.get(o["layout"], o["layout"])
    if o["layout"] not in ("emblem", "hud", "bossbar", "compact"):
        o["layout"] = "emblem"
    if o["position"] not in ("tl", "tr", "bl", "br"):
        o["position"] = "tl"
    o["scale"] = int(min(250, max(40, o["scale"])))
    o["backdrop"] = int(min(100, max(0, o["backdrop"])))
    b = settings["banners"]
    b["duration"] = float(min(12, max(1.5, b["duration"])))
    b["you_died_text"] = b["you_died_text"].strip()[:40] or "YOU DIED"
    s = settings["sound"]
    s["volume"] = int(min(100, max(0, s["volume"])))
    if settings["language"] not in ("de", "en"):
        settings["language"] = "de"
    return settings


def find_saves():
    appdata = os.environ.get("APPDATA")
    if not appdata:
        return []
    root = Path(appdata) / "EldenRing"
    found = sorted(root.glob("*/ER0000.sl2")) + sorted(root.glob("*/ER0000.co2"))
    return [str(p) for p in found]


def newest_save():
    """The save Elden Ring wrote most recently (handles several Steam profiles)."""
    saves = find_saves()
    if not saves:
        return None
    return max(saves, key=lambda p: Path(p).stat().st_mtime)


class Hub:
    """Fan-out of server-sent events to every connected browser."""

    def __init__(self):
        self._lock = threading.Lock()
        self._clients = set()

    def subscribe(self):
        q = queue.Queue(maxsize=200)
        with self._lock:
            self._clients.add(q)
        return q

    def unsubscribe(self, q):
        with self._lock:
            self._clients.discard(q)

    def publish(self, kind, payload):
        message = (kind, payload)
        with self._lock:
            clients = list(self._clients)
        for q in clients:
            try:
                q.put_nowait(message)
            except queue.Full:
                pass


class Tracker:
    def __init__(self, data_dir, obs_dir, save_path=None, slot=None):
        self.data_dir = Path(data_dir)
        self.obs_dir = Path(obs_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.obs_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = self.data_dir / "state.json"
        self.hub = Hub()
        self.updater = None
        self.lock = threading.RLock()
        self._dirty = threading.Event()
        self._stop = threading.Event()

        stored = self._load()
        self.settings = clamp_settings(merge(DEFAULT_SETTINGS, stored.get("settings")))
        self.bosses = [b for b in (self._clean_boss(x) for x in stored.get("bosses", [])) if b]
        if not stored:
            self.bosses = [self._new_boss(name, great, region) for name, great, region in PRESETS]
        self.current_boss = stored.get("current_boss")
        if not any(b["id"] == self.current_boss for b in self.bosses):
            self.current_boss = None
        self.offset = int(stored.get("offset", 0))
        self.last_save_total = stored.get("last_save_total")

        session = stored.get("session") or {}
        if self.settings["session"]["reset_on_start"] or not session:
            self._reset_session_fields()
        else:
            self.session_started = float(session.get("started", time.time()))
            self.session_save = int(session.get("save", 0))
            self.session_manual = int(session.get("manual", 0))
            self.log = list(session.get("log", []))[-MAX_LOG:]

        self.auto_save = bool(stored.get("auto_save", True)) and save_path is None
        self.slot_pinned = bool(stored.get("slot_pinned", False)) or slot is not None
        self.save_path = str(save_path) if save_path else stored.get("save_path")
        self.slot = slot if slot is not None else stored.get("slot")
        self._playtimes = {}
        self._polls = 0
        self.updated = None
        self.characters = []
        self.character = None
        self.save_total = None
        self.status = "idle"
        self.message = ""
        self._stamp = None
        self._previous = None
        if self.auto_save:
            self.save_path = newest_save() or self.save_path
        self._mark()

    # ---------- persistence ----------

    def _load(self):
        try:
            return json.loads(self.state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _snapshot_for_disk(self):
        return {
            "settings": self.settings,
            "bosses": self.bosses,
            "current_boss": self.current_boss,
            "offset": self.offset,
            "last_save_total": self.save_total if self.save_total is not None else self.last_save_total,
            "save_path": self.save_path,
            "slot": self.slot,
            "auto_save": self.auto_save,
            "slot_pinned": self.slot_pinned,
            "session": {
                "started": self.session_started,
                "save": self.session_save,
                "manual": self.session_manual,
                "log": self.log,
            },
        }

    def _flush(self):
        with self.lock:
            data = json.dumps(self._snapshot_for_disk(), ensure_ascii=False, indent=1)
            total, session = self.total(), self.session()
            boss = self._boss(self.current_boss)
        temp = self.state_file.with_suffix(".tmp")
        temp.write_text(data, encoding="utf-8")
        temp.replace(self.state_file)
        # Plain text files keep working for "Text (GDI+)" sources.
        dc.write_count(self.obs_dir / "deaths_total.txt", total)
        dc.write_count(self.obs_dir / "deaths_session.txt", session)
        boss_text = f"{boss['name']}: {boss['deaths']}" if boss else ""
        path = self.obs_dir / "boss_current.txt"
        try:
            if path.read_text(encoding="utf-8") == boss_text:
                return
        except OSError:
            pass
        path.write_text(boss_text, encoding="utf-8")

    def _mark(self):
        self._dirty.set()

    # ---------- derived values ----------

    def total(self):
        return max(0, (self.save_total if self.save_total is not None else (self.last_save_total or 0)) + self.offset)

    def session(self):
        return max(0, self.session_save + self.session_manual)

    def _boss(self, boss_id):
        return next((b for b in self.bosses if b["id"] == boss_id), None)

    def public_state(self):
        with self.lock:
            return {
                "settings": self.settings,
                "counts": {
                    "total": self.total(),
                    "session": self.session(),
                    "save_total": self.save_total,
                    "offset": self.offset,
                },
                "session": {"started": self.session_started, "log": self.log[-60:]},
                "bosses": self.bosses,
                "current_boss": self.current_boss,
                "save": {
                    "path": self.save_path,
                    "slot": self.slot,
                    "auto": self.auto_save,
                    "slot_pinned": self.slot_pinned,
                    "status": self.status,
                    "message": self.message,
                    "characters": self.characters,
                    "updated": self.updated,
                    "character": self.character,
                    "found": find_saves(),
                },
                "logo": self.logo_info(),
                "update": self.updater.public() if self.updater else None,
                "game_assets_missing": game_assets.missing(),
                "server_time": time.time(),
            }

    # ---------- custom logo ----------

    LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}

    def logo_path(self):
        for ext in set(self.LOGO_TYPES.values()):
            path = self.data_dir / f"logo{ext}"
            if path.is_file():
                return path
        return None

    def logo_info(self):
        path = self.logo_path()
        return {"url": f"/media/logo?v={path.stat().st_mtime_ns}"} if path else None

    def set_logo(self, content_type, body):
        ext = self.LOGO_TYPES.get(content_type)
        if not ext:
            raise ValueError("Bitte ein PNG-, JPG-, WebP- oder GIF-Bild wählen.")
        if not body or len(body) > 6 * 1024 * 1024:
            raise ValueError("Das Bild darf höchstens 6 MB groß sein.")
        self.clear_logo(broadcast=False)
        (self.data_dir / f"logo{ext}").write_bytes(body)
        with self.lock:
            self.settings["overlay"]["show_logo"] = True
            self._mark()
        self._broadcast_state()

    def clear_logo(self, broadcast=True):
        for ext in set(self.LOGO_TYPES.values()):
            (self.data_dir / f"logo{ext}").unlink(missing_ok=True)
        if broadcast:
            with self.lock:
                self.settings["overlay"]["show_logo"] = False
                self._mark()
            self._broadcast_state()

    def _broadcast_state(self):
        self.hub.publish("state", self.public_state())

    def broadcast(self):
        self._broadcast_state()

    # ---------- boss helpers ----------

    @staticmethod
    def _new_boss(name, great=False, region=""):
        return {"id": uuid.uuid4().hex[:10], "name": name, "great": bool(great), "region": region,
                "deaths": 0, "felled": False, "felled_at": None}

    @staticmethod
    def _clean_boss(raw):
        if not isinstance(raw, dict) or not isinstance(raw.get("name"), str) or not raw["name"].strip():
            return None
        return {
            "id": str(raw.get("id") or uuid.uuid4().hex[:10]),
            "name": raw["name"].strip()[:80],
            "great": bool(raw.get("great")),
            "region": str(raw.get("region") or "")[:60],
            "deaths": max(0, int(raw.get("deaths") or 0)),
            "felled": bool(raw.get("felled")),
            "felled_at": raw.get("felled_at"),
        }

    def _reset_session_fields(self):
        self.session_started = time.time()
        self.session_save = 0
        self.session_manual = 0
        self.log = []

    # ---------- deaths ----------

    def _register(self, amount, source):
        """Apply `amount` deaths (may be negative for corrections). Caller holds the lock."""
        boss = self._boss(self.current_boss)
        if boss and not boss["felled"]:
            boss["deaths"] = max(0, boss["deaths"] + amount)
        else:
            boss = None
        self.log.append({"t": time.time(), "amount": amount, "source": source,
                         "boss": boss["name"] if boss else None})
        del self.log[:-MAX_LOG]
        self._mark()
        if amount > 0:
            self.hub.publish("death", {"amount": amount, "total": self.total(), "session": self.session(),
                                       "boss": boss["name"] if boss else None,
                                       "boss_deaths": boss["deaths"] if boss else None})

    # ---------- actions from the control panel ----------

    def apply(self, action):
        if not isinstance(action, dict):
            raise ValueError("Ungültige Aktion.")
        kind = action.get("type")
        with self.lock:
            handler = getattr(self, f"_do_{kind}", None) if isinstance(kind, str) else None
            if handler is None:
                raise ValueError(f"Unbekannte Aktion: {kind}")
            result = handler(action)
            self._mark()
        self._broadcast_state()
        return result

    def _do_death_add(self, a):
        amount = int(a.get("amount", 1))
        if not 1 <= amount <= 50:
            raise ValueError("Anzahl muss zwischen 1 und 50 liegen.")
        self.offset += amount
        self.session_manual += amount
        self._register(amount, "manual")

    def _do_death_remove(self, a):
        if self.total() <= 0:
            raise ValueError("Der Zähler steht bereits auf null.")
        self.offset -= 1
        if self.session() > 0:
            self.session_manual -= 1
        self._register(-1, "manual")

    def _do_set_total(self, a):
        value = int(a.get("value"))
        if not 0 <= value <= 999999:
            raise ValueError("Wert muss zwischen 0 und 999999 liegen.")
        base = self.save_total if self.save_total is not None else (self.last_save_total or 0)
        self.offset = value - base

    def _do_session_new(self, a):
        self._reset_session_fields()
        self.hub.publish("notice", {"kind": "session"})

    def _do_boss_set(self, a):
        boss_id = a.get("id")
        if boss_id is None:
            self.current_boss = None
            return
        boss = self._boss(boss_id)
        if not boss:
            raise ValueError("Boss nicht gefunden.")
        if boss["felled"]:
            boss["felled"] = False
            boss["felled_at"] = None
        changed = self.current_boss != boss_id
        self.current_boss = boss_id
        if changed:
            self.hub.publish("boss", {"name": boss["name"], "region": boss["region"], "deaths": boss["deaths"]})

    def _do_boss_add(self, a):
        name = str(a.get("name", "")).strip()
        if not name:
            raise ValueError("Bitte einen Namen eingeben.")
        boss = self._new_boss(name[:80], bool(a.get("great")), str(a.get("region", "")).strip()[:60])
        self.bosses.append(boss)
        if a.get("select"):
            self._do_boss_set({"id": boss["id"]})
        return boss

    def _do_boss_update(self, a):
        boss = self._boss(a.get("id"))
        if not boss:
            raise ValueError("Boss nicht gefunden.")
        if "name" in a:
            name = str(a["name"]).strip()
            if not name:
                raise ValueError("Der Name darf nicht leer sein.")
            boss["name"] = name[:80]
        if "region" in a:
            boss["region"] = str(a["region"]).strip()[:60]
        if "great" in a:
            boss["great"] = bool(a["great"])
        if "deaths" in a:
            boss["deaths"] = max(0, min(99999, int(a["deaths"])))

    def _do_boss_remove(self, a):
        boss = self._boss(a.get("id"))
        if not boss:
            raise ValueError("Boss nicht gefunden.")
        self.bosses.remove(boss)
        if self.current_boss == boss["id"]:
            self.current_boss = None

    def _do_boss_move(self, a):
        boss = self._boss(a.get("id"))
        if not boss:
            raise ValueError("Boss nicht gefunden.")
        index = self.bosses.index(boss)
        target = max(0, min(len(self.bosses) - 1, index + int(a.get("delta", 0))))
        self.bosses.insert(target, self.bosses.pop(index))

    def _do_boss_felled(self, a):
        boss = self._boss(a.get("id", self.current_boss))
        if not boss:
            raise ValueError("Kein Boss ausgewählt.")
        boss["felled"] = True
        boss["felled_at"] = time.time()
        if self.current_boss == boss["id"]:
            self.current_boss = None
        self.hub.publish("felled", {"name": boss["name"], "great": boss["great"], "deaths": boss["deaths"]})

    def _do_boss_revive(self, a):
        boss = self._boss(a.get("id"))
        if not boss:
            raise ValueError("Boss nicht gefunden.")
        boss["felled"] = False
        boss["felled_at"] = None

    def _do_bosses_reset(self, a):
        for boss in self.bosses:
            boss.update(deaths=0, felled=False, felled_at=None)
        self.current_boss = None

    def _do_bosses_presets(self, a):
        known = {b["name"].lower() for b in self.bosses}
        for name, great, region in PRESETS:
            if name.lower() not in known:
                self.bosses.append(self._new_boss(name, great, region))

    def _do_settings(self, a):
        patch = a.get("patch")
        merged = merge(DEFAULT_SETTINGS, self.settings)
        self.settings = clamp_settings(merge(DEFAULT_SETTINGS, deep_update(merged, patch)))

    def _do_settings_reset(self, a):
        self.settings = copy.deepcopy(DEFAULT_SETTINGS)

    def _do_save_auto(self, a):
        self.auto_save = True
        self.slot_pinned = False
        self.save_path = newest_save()
        self.slot = None
        self.offset = 0
        self._rebase()

    def _do_save_set(self, a):
        path = str(a.get("path", "")).strip().strip('"')
        if not path:
            # Hand counting continues from the last value that was shown.
            self.save_path = None
            self.slot = None
        else:
            p = Path(path)
            if not p.is_file():
                raise ValueError(f"Datei nicht gefunden: {path}")
            if p.resolve().parent == self.obs_dir.resolve():
                raise ValueError("Der Spielstand darf keine OBS-Ausgabedatei sein.")
            if p.resolve() != Path(self.save_path or "").resolve():
                self.slot = None
                self.offset = 0
                self.last_save_total = None
            self.save_path = str(p)
        self.auto_save = False
        self._rebase()

    def _do_slot_set(self, a):
        slot = a.get("slot")
        if slot is not None and not (isinstance(slot, int) and 1 <= slot <= 10):
            raise ValueError("Slot muss zwischen 1 und 10 liegen.")
        self.slot_pinned = slot is not None
        if slot != self.slot:
            self.slot = slot
            self.offset = 0
            self._rebase()

    def _do_update_check(self, a):
        if not self.updater:
            raise ValueError("Updates sind nicht verfügbar.")
        self.updater.check_async()

    def _do_update_install(self, a):
        if not self.updater:
            raise ValueError("Updates sind nicht verfügbar.")
        self.updater.install_async()

    def _do_game_assets_fetch(self, a):
        try:
            game_assets.fetch()
        except Exception as error:
            raise ValueError(f"Download fehlgeschlagen: {error}")

    def _do_test(self, a):
        what = a.get("what")
        boss = self._boss(self.current_boss)
        if what == "death":
            self.hub.publish("death", {"amount": 1, "total": self.total(), "session": self.session(),
                                       "boss": boss["name"] if boss else None,
                                       "boss_deaths": boss["deaths"] if boss else None, "test": True})
        elif what == "felled":
            self.hub.publish("felled", {"name": boss["name"] if boss else "Margit, the Fell Omen",
                                        "great": bool(a.get("great", True)), "deaths": 0, "test": True})
        elif what == "boss":
            self.hub.publish("boss", {"name": boss["name"] if boss else "Godrick the Grafted",
                                      "region": boss["region"] if boss else "Stormveil Castle", "test": True})
        else:
            raise ValueError("Unbekannter Test.")

    def _rebase(self):
        self._stamp = None
        self._previous = None
        self.save_total = None
        self.character = None
        self.characters = []
        self._playtimes = {}

    # ---------- save watcher ----------

    def _set_status(self, status, message=""):
        if (status, message) != (self.status, self.message):
            self.status, self.message = status, message
            return True
        return False

    def poll_save(self):
        """Read the save once if it changed. Returns True when public state changed."""
        self._polls += 1
        with self.lock:
            auto = self.auto_save
        if auto and (self._polls % 10 == 1 or not self.save_path):
            # Look again now and then: a new Steam profile or a first save may appear mid-stream.
            found = newest_save()
            with self.lock:
                if found and found != self.save_path and self.auto_save:
                    # A newly connected save is authoritative: hand-counted corrections do not carry over.
                    self.save_path = found
                    self.offset = 0
                    self.last_save_total = None
                    self.slot = None if not self.slot_pinned else self.slot
                    self._rebase()
        with self.lock:
            path_text, slot = self.save_path, self.slot
        if not path_text:
            with self.lock:
                if self.auto_save:
                    return self._set_status("searching", "Noch kein Spielstand gefunden. Der Counter sucht weiter und zählt bis dahin von Hand.")
                return self._set_status("manual", "Kein Spielstand gewählt. Der Zähler läuft manuell.")
        path = Path(path_text)
        try:
            stamp = dc.save_stamp(path.stat())
            if stamp == self._stamp:
                return False
            data, next_stamp = dc.read_snapshot(path)
            characters = {c.slot: c for c in dc.list_characters(data)}
            listing = [{"slot": c.slot, "name": c.name, "level": c.level, "playtime": c.playtime}
                       for c in characters.values()]
            with self.lock:
                if (path_text, slot) != (self.save_path, self.slot):
                    return False
                changed = listing != self.characters
                self.characters = listing
                if not characters:
                    raise dc.SaveError("Im Spielstand ist noch kein Charakter vorhanden.")
                # Follow the character being played: only its playtime grows between two saves.
                grew = [s for s, c in characters.items()
                        if s in self._playtimes and c.playtime > self._playtimes[s]]
                self._playtimes = {s: c.playtime for s, c in characters.items()}
                if not self.slot_pinned and len(grew) == 1 and grew[0] != slot:
                    slot = self.slot = grew[0]
                    self._previous = None
                    self.offset = 0
                if slot is None or (not self.slot_pinned and slot not in characters):
                    # First look: assume the character with the most playtime until another one moves.
                    slot = self.slot = max(characters.values(), key=lambda c: c.playtime).slot
                    self._previous = None
                if slot not in characters:
                    raise dc.SaveError(f"Slot {slot} ist leer.")
                character = characters[slot]
                total = dc.read_deaths(data, slot)
                if self._previous is not None:
                    old_character, old_total = self._previous
                    if character.name != old_character.name:
                        self._previous = None
                        self.offset = 0
                    elif character.playtime >= old_character.playtime and total > old_total:
                        self.session_save += total - old_total
                        self.save_total = total
                        self._register(total - old_total, "save")
                self.save_total = total
                self.last_save_total = total
                self.character = {"slot": slot, "name": character.name, "level": character.level,
                                  "playtime": character.playtime}
                self._previous = (character, total)
                self._stamp = next_stamp
                self.updated = time.time()
                self._set_status("watching", "")
                self._mark()
                return True
        except (OSError, dc.SaveError) as error:
            with self.lock:
                message = str(error)
                if isinstance(error, FileNotFoundError):
                    message = f"Spielstand nicht gefunden: {path_text}"
                return self._set_status("error", message)

    def run(self):
        """Background loop: poll the save every second and flush state to disk when dirty."""
        last_flush = 0.0
        while not self._stop.is_set():
            try:
                if self.poll_save():
                    self._broadcast_state()
            except Exception as error:  # keep the watcher alive no matter what
                with self.lock:
                    self._set_status("error", f"Interner Fehler: {error}")
                self._broadcast_state()
            if self._dirty.is_set() and time.time() - last_flush > 0.4:
                self._dirty.clear()
                try:
                    self._flush()
                except OSError as error:
                    print(f"Konnte Zustand nicht speichern: {error}")
                last_flush = time.time()
            self._stop.wait(0.5)
        if self._dirty.is_set():
            self._flush()

    def stop(self):
        self._stop.set()


def deep_update(base, patch):
    if not isinstance(patch, dict):
        return base
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            deep_update(base[key], value)
        else:
            base[key] = value
    return base
