# Elden Ring Death Counter für OBS

Zählt deine Tode in Elden Ring automatisch und zeigt sie im Stream. Dazu gibt es ein Steuerpult für dich als Streamer.
Läuft unter Windows mit Python 3.9 oder neuer. Zusätzliche Python-Pakete sind nicht nötig.

## So zählt der Counter

Elden Ring speichert für jeden Charakter selbst, wie oft er gestorben ist. Der Counter liest diese Zahl einmal pro
Sekunde aus deinem Spielstand `ER0000.sl2` und verändert die Datei dabei nie.

- **Gesamt** ist die Zahl aus dem Spielstand. Sie enthält auch alle Tode, die vor dem ersten Start des Counters passiert sind.
- **Diese Session** beginnt beim Start bei null.
- Neue Tode erscheinen, sobald das Spiel speichert, meist wenige Sekunden nach dem Tod.

Den Spielstand findet der Counter von selbst unter `%APPDATA%\EldenRing`. Bei mehreren Steam-Profilen nimmt er den
zuletzt gespeicherten. Bei mehreren Charakteren erkennt er den, den du gerade spielst, denn nur dessen Spielzeit läuft
weiter. Seamless Coop (`ER0000.co2`) wird mit erkannt. Ohne Spielstand zählst du mit der Leertaste von Hand.

## Start

1. Neueste Version unter [Releases](https://github.com/prodbycooooooollin-byte/elden-ring-death-counter/releases/latest)
   als Zip herunterladen und **entpacken** (Rechtsklick > „Alle extrahieren“). Aus dem Zip heraus startet die App nicht.
2. Im entpackten Ordner `DeathCounter.exe` doppelklicken. Es öffnet sich das Fenster des Counters. Python oder andere
   Programme müssen nicht installiert sein.
   Beim ersten Start kann Windows SmartScreen warnen, weil die Datei neu und unsigniert ist:
   „Weitere Informationen“ > „Trotzdem ausführen“.
3. Beim ersten Start in den Einstellungen auf **Spiel-Icons laden** klicken (siehe [Quellen](assets/QUELLEN.md)).
4. In OBS eine **Browser**-Quelle mit `http://127.0.0.1:8737/overlay/` anlegen, Breite 1920, Höhe 1080.
   Die Seite **OBS-Overlay** im Pult zeigt alle Adressen und eine Vorschau.

Schließt du das Fenster, läuft der Counter im Hintergrund weiter, solange OBS das Overlay anzeigt, und beendet sich
danach von selbst. Ein erneuter Doppelklick holt das Fenster zurück. Sofort beenden: Einstellungen > Programm.

## Updates

Beim Start prüft der Counter, ob es auf GitHub ein neueres Release gibt, und spielt es ein. Danach startet er neu.
Zähler, Bosse, Einstellungen und eigene Dateien in `assets` bleiben dabei erhalten. In den Einstellungen lässt sich
das automatische Installieren abschalten und von Hand prüfen.

## Weitere Funktionen

- Bosse: Wähle den aktuellen Gegner. Jeder Tod wird ihm angerechnet. „Feind gefällt“ blendet die Siegesmeldung ein.
- Einblendungen im Overlay: YOU DIED bei jedem Tod, FEIND GEFÄLLT, Name des neuen Gegners.
- Stream Deck: Adressen wie `http://127.0.0.1:8737/api/quick/add` lösen Aktionen aus (Liste im Pult unter Einstellungen).
- Für „Text (GDI+)“-Quellen schreibt der Counter weiterhin `obs-data/deaths_total.txt`, `deaths_session.txt` und `boss_current.txt`.
- Eigene Schrift, eigenes Icon, eigene Klänge: siehe `assets/LIESMICH.txt`.

## Für Entwickler

```powershell
py -3 -m app --no-browser          # Server starten (oder: start_counter.cmd)
py -3 -m unittest discover tests   # Tests mit künstlichen Spielständen
pyinstaller --windowed --onedir --name DeathCounter --icon launcher/emblem.ico launcher/launcher.py
py -3 tools/build_release.py --exe-dir dist/DeathCounter   # Release-Zip in dist/ bauen
```

`death_counter.py` funktioniert weiterhin allein als Kommandozeilenwerkzeug (`py -3 death_counter.py --list`).

Das Dateilayout orientiert sich am [Save-Parser von EldenRingDeathCounterOBS](https://github.com/froagkey/EldenRingDeathCounterOBS/blob/e4c77fe/death_counter/save_parser.py)
und an der [SaveForge-Dokumentation](https://github.com/oisis/EldenRing-SaveForge/blob/main/spec/26-parameter-reference.md#death-count).

Elden Ring ist eine Marke von FromSoftware Inc. und Bandai Namco Entertainment. Dieses Projekt ist ein inoffizielles Fanprojekt.
