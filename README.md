# Death Counter für Elden Ring

Windows-App, die deine Tode in Elden Ring automatisch zählt und als Overlay in OBS zeigt.

## Installieren

1. Unter [Releases](https://github.com/prodbycooooooollin-byte/elden-ring-death-counter/releases/latest)
   `DeathCounter-Setup-<Version>.exe` herunterladen und starten.
   Windows SmartScreen kann warnen, weil die App nicht signiert ist: „Weitere Informationen“ > „Trotzdem ausführen“.
2. Die App startet von selbst und liegt danach im Startmenü und auf dem Desktop.

Updates lädt die App selbst von GitHub.

## So zählt die App

Elden Ring speichert für jeden Charakter, wie oft er gestorben ist. Die App findet deinen Spielstand
(`%APPDATA%\EldenRing\<Steam-ID>\ER0000.sl2`, auch Seamless Coop `ER0000.co2`) beim Start von selbst und reagiert sofort,
wenn das Spiel ihn speichert. Sie liest die Datei nur und verändert sie nie.

- **Tode insgesamt** kommen aus dem Spielstand und enthalten auch alle Tode von vor der Installation.
- **Diese Session** beginnt beim Start bei null.
- Bei mehreren Charakteren folgt die App dem, den du gerade spielst. Unter „Charakter“ lässt er sich auch fest wählen.
- Ohne Spielstand zählst du mit der Leertaste von Hand.

## In OBS einbinden

Seite **OBS-Overlay** öffnen, **Adresse kopieren**, in OBS eine **Browser**-Quelle anlegen, URL einfügen, 1920 × 1080.
Der Hintergrund ist durchsichtig. Die App muss während des Streams laufen. Schließt du das Fenster, läuft sie im
Infobereich weiter. Beenden über das Symbol dort.

## Weitere Funktionen

- Bosse: aktiven Gegner wählen, Versuche zählen, als gefällt markieren.
- Overlay-Stile: Emblem, Leiste, Kompakt, Bossbalken. Position, Größe, Schatten und Zusatzwerte einstellbar.
- Stream Deck: Adressen unter Einstellungen (`http://127.0.0.1:8737/api/quick/add` usw.).
- Textdateien für „Text (GDI+)“-Quellen: OBS-Overlay > Textquellen > Ordner öffnen.

## Entwicklung

```powershell
npm install
npm run dev        # App mit Hot Reload
npm test           # Tests mit künstlichen Spielständen
npm run dist       # Installer in dist/
npm run release    # Installer bauen und als GitHub-Release veröffentlichen (GH_TOKEN nötig)
```

Aufbau: `src/main` (Electron-Hauptprozess: Spielstand-Leser, Tracker, Overlay-Server, Updates), `src/preload`,
`src/renderer` (React, Tailwind, Radix UI, Motion, Lucide), `overlay/` (Browserquelle für OBS).

Das Dateilayout des Spielstands folgt dem [Save-Parser von EldenRingDeathCounterOBS](https://github.com/froagkey/EldenRingDeathCounterOBS/blob/e4c77fe/death_counter/save_parser.py)
und der [SaveForge-Dokumentation](https://github.com/oisis/EldenRing-SaveForge/blob/main/spec/26-parameter-reference.md#death-count).

Elden Ring ist eine Marke von FromSoftware Inc. und Bandai Namco Entertainment. Dies ist ein inoffizielles Fanprojekt.
Das Emblem stammt aus der eigenen Referenzgestaltung des Projekts.
