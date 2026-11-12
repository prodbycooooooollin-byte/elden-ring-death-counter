"""Original Elden Ring icons used by the UI.

They belong to FromSoftware / Bandai Namco and are not part of the repository.
The streamer fetches them once from the fan wiki they were extracted to (button in Settings).
Sources are listed in assets/QUELLEN.md.
"""

from pathlib import Path
import urllib.request

GAME_DIR = Path(__file__).resolve().parent.parent / "assets" / "game"

FILES = {
    "death-blight.png": "https://eldenring.wiki.gg/images/Death_Blight.png?273b11&format=original",
    "sacrificial-twig.png": "https://eldenring.wiki.gg/images/ER_Icon_Talisman_Sacrificial_Twig.png?e0385c&format=original",
}


def missing():
    return [name for name in FILES if not (GAME_DIR / name).is_file()]


def fetch():
    GAME_DIR.mkdir(parents=True, exist_ok=True)
    for name in missing():
        request = urllib.request.Request(FILES[name], headers={"User-Agent": "elden-ring-death-counter"})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(2 * 1024 * 1024)
        if not data.startswith(b"\x89PNG"):
            raise ValueError(f"{name}: Antwort ist kein PNG-Bild.")
        temp = GAME_DIR / f"{name}.part"
        temp.write_bytes(data)
        temp.replace(GAME_DIR / name)
