# Wichteln

Mobile Webseite für die Weihnachtsrunde. Jede Person beschenkt zwei andere
und erhält zwei Geschenke. Nur dieselbe Zweierkombination wie im Vorjahr
ist ausgeschlossen. Ein einzelner Empfänger darf sich wiederholen.

## Erster Entwurf

Tannengrünes Layout mit Papierfarben, ohne Fotos. Die acht Namen stammen
aus dem ursprünglichen Projekt. Die Vorjahresauslosung ist weiterhin ein
erfundenes Beispiel, persönliche Ausschlüsse sind noch nicht übernommen.
Der gespeicherte Jahrgang
2026 ist eine Demo, keine echte Weihnachtsrunde. Zugriffsschutz ist noch
nicht umgesetzt: Jeder kann andere Namen auswählen. Alle Ergebnisse
sind im öffentlichen Repository und in der Webseite lesbar.

Vor dem Öffnen wird der ausgewählte Name in einem Bestätigungsdialog
nochmals angezeigt. Das schützt gegen versehentliches Öffnen, prüft aber
nicht die Identität. Abbrechen oder Escape zeigt keine Empfänger an.

Teilnehmer können zwischen den Jahren hinzukommen oder ausscheiden.
Vor der Auslosung die aktuelle Teilnehmerliste und alle Ausschlüsse
aktualisieren. Für neue Personen gilt kein Vorjahresausschluss. Empfänger
werden ausschließlich aus der aktuellen Teilnehmerliste ausgewählt.

## Lokal ansehen

`site/index.html` direkt im Browser öffnen oder:

```powershell
python -m http.server 8000 --directory site
```

Dann http://localhost:8000 öffnen. Keine zusätzlichen Python-Pakete nötig.

## GitHub Pages

Unter **Settings → Pages → Source → GitHub Actions** einstellen.
Danach **Actions → Webseite veröffentlichen → Run workflow** oder eine
Änderung nach `main` hochladen. Erwartete Adresse:
https://grosseskrokodil.github.io/ThiemoWichteln/

## Jahresrunde vorbereiten und auslosen

1. `data/config.json`: Jahr, Namen, Ausschlüsse eintragen; für echte Daten
   `demo` auf `false` setzen. Ausschlüsse sind gerichtet. Für beidseitige
   Ausschlüsse beide Richtungen eintragen.
2. `data/years/<Vorjahr>.json`: Echte Vorjahresdaten hinterlegen. Format:
   `year`, `demo: false`, `allocations` (Name → Liste mit zwei Namen).
3. Vor einer echten Runde die Demo-Datei des gewünschten aktuellen Jahres
   bewusst entfernen. Eine vorhandene Jahresdatei wird niemals überschrieben.
4. Änderungen hochladen und **Actions → Jahrgang auslosen → Run workflow**
   starten. Die Aufgabe speichert die Auslosung und veröffentlicht die Seite.

Ein zweiter Start im selben Jahr wird abgelehnt. Layoutänderungen und
Neuladen der Webseite lösen nicht neu aus. Teilnehmer und Ausschlüsse
dürfen nach der Auslosung nicht unbemerkt geändert werden: Der Build prüft
dies und bricht gegebenenfalls ab. Für das nächste Jahr nur die Konfiguration
aktualisieren; das unmittelbar vorherige Jahr wird automatisch berücksichtigt.
Die Reihenfolge der beiden Empfänger spielt beim Vorjahresvergleich keine
Rolle. Namen müssen zwischen den Jahren konsistent sein.

Für eine erste Runde ohne Vorjahr ist lokal bewusst
`python scripts/wichteln.py draw --first-year` möglich. Im normalen Ablauf
wird ein fehlendes Vorjahr als Fehler gemeldet. Bei unmöglichen Regeln
wird nichts gespeichert. Bei Erreichen der Suchgrenze meldet das Programm
den Abbruch, ohne Unmöglichkeit zu behaupten. Die Suche arbeitet zufällig,
garantiert aber keine Gleichverteilung aller möglichen Gesamtauslosungen.

## Dateien und lokale Befehle

- `site/`: Oberfläche und öffentliche Jahresdaten.
- `data/config.json`: Jahr, Teilnehmer und persönliche Ausschlüsse.
- `data/years/`: dauerhaft gespeicherte Jahresauslosungen.
- `scripts/wichteln.py`: gemeinsame Logik für Auslosung und Veröffentlichung.
- `.github/workflows/`: integrierter Ablauf in GitHub Actions.

```powershell
python scripts/wichteln.py draw
python scripts/wichteln.py build
python -m unittest discover -s tests -v
```

`build` prüft und verwendet nur das bestehende Ergebnis. Die Vorjahresdatei
und die Demo-Einstellungen müssen vor einer echten Auslosung ersetzt werden.
