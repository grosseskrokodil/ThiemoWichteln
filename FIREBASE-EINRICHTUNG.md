# Firebase: persönliche Wichtelbriefe und Wunschlisten

## Die vier Versionen

| Datei in `site/` | Texte | Zuordnung und Daten |
| --- | --- | --- |
| `index.html` | Ursprungstext „Post für dich.“ | Ohne Firebase, bisherige öffentliche Zuordnung |
| `index-kurz.html` | „Wichtelrunde …“, weniger Text | Ohne Firebase, dieselbe öffentliche Zuordnung |
| `firebase.html` | Ursprungstext | Persönlicher Link, geschützte Zuordnung und Wunschlisten |
| `firebase-kurz.html` | Reduzierter Text | Derselbe persönliche Linkcode und dieselben Firebase-Daten |

Beide Firebase-Layouts arbeiten mit denselben Daten. Zum Layoutwechsel
nur `firebase.html` gegen `firebase-kurz.html` im Link austauschen und
den vollständigen Teil nach `#key=` behalten. Das Layout lost nichts aus.

## Was die Firebase-Versionen tun

1. Geheimcode im Link prüfen und nur den zugehörigen Namen laden.
2. Den aktiven Jahrgang anzeigen. Noch keine Empfänger laden.
3. „Meinen Brief öffnen“ → „Bist du wirklich …?“ → „Ja, das bin ich“.
4. Erst dann die eigene Zuordnung und die zwei zugehörigen Namen laden.
5. Eigene Wünsche als Text pflegen; bei den beiden
   Empfängern Wünsche ansehen und reservieren beziehungsweise freigeben.

Die Datenbankregeln verhindern das Lesen anderer Zuordnungen, das Ändern
fremder Wünsche und das Lesen der eigenen Geschenkreservierungen.
Gleichzeitige Reservierungen sind transaktional: Nur eine gewinnt.
Die Bestätigung ist ein Schutz vor Versehen, keine Identitätsprüfung.
Wer einen fremden vollständigen Geheimlink besitzt, hat dessen Zugang.

## Dauerhafte persönliche Links

Jede Person hat eine feste zufällige ID und einen 256-Bit-Geheimcode.
Beides bleibt bei neuen Auslosungen und neuen Jahren erhalten.
Nur neue Personen erhalten neue Codes. Ausscheidende Personen werden bei
der Veröffentlichung gesperrt; bei ihrer Rückkehr kann derselbe Link
wieder freigeschaltet werden. Namen allein sind nicht die Identität.

Die private Datei `.private/firebase/participants.json` ist das dauerhafte
Teilnehmerverzeichnis. Sie und `.private/firebase/links.txt` müssen sicher
aufbewahrt werden. Nicht löschen oder neu erzeugen, wenn Links verteilt
sind. `.private/` ist in `.gitignore` ausgeschlossen. Auch gehashte
Zugangsschlüssel gehören nicht ins öffentliche Repository.

Vorbereitete Links des vorherigen lokalen Entwicklungsstands werden bei
`init` nach Möglichkeit übernommen. Verbindlich sind anschließend die
beiden neuen Adressen in `.private/firebase/links.txt`.

## 1. Firebase-Projekt manuell einrichten

1. In https://console.firebase.google.com/ ein Projekt im kostenlosen
   Spark-Tarif erstellen beziehungsweise das bereits erstellte verwenden.
2. Eine **Web-App** (`</>`) registrieren. Die öffentlichen Web-Werte aus
   `firebaseConfig` in `site/firebase-config.js` übernehmen. Die Datei
   enthält keine Administratorzugänge. `emulators` im Betrieb `null` lassen.
3. **Authentication → Sign-in method → Anonymous** aktivieren. Teilnehmer
   registrieren sich nicht; die technische anonyme Sitzung entsteht automatisch.
4. Unter den Authentication-Einstellungen `grosseskrokodil.github.io`,
   `localhost` und bei Bedarf `127.0.0.1` als verwendete Domains eintragen.
5. **Cloud Firestore**, Datenbank `(default)`, Standard Edition, im
   Produktionsmodus erstellen. Eine passende EU-Region auswählen.
6. Unter **Firestore → Rules** den vollständigen Inhalt von
   `firestore.rules` einsetzen und veröffentlichen. Niemals allgemeine
   öffentliche Schreibrechte aktivieren.

Es werden keine Cloud Functions, kein Firebase Hosting und kein eigenes
Serverhosting benötigt. GitHub Pages bleibt für die Webseite zuständig.

## 2. Private Verwaltung vorbereiten

Im Projektordner einmal ausführen:

```powershell
python scripts/setup_wishes.py init
```

Das ist bereits lokal vorbereitet. Der Befehl ist wiederholbar: Bestehende
private Konfigurationen, Jahresdateien und Codes werden nicht ersetzt.
Er übernimmt die bisherige echte Jahresauslosung und die Vorjahre, ohne
neu auszulosen und ohne Firebase zu kontaktieren.

Private Dateien:

- `.private/firebase/config.json`: aktuelles Jahr, Teilnehmer, Ausschlüsse.
- `.private/firebase/years/<Jahr>.json`: geschützte lokale Jahresauslosungen.
- `.private/firebase/participants.json`: dauerhafte IDs und Geheimcodes.
- `.private/firebase/links.txt`: pro Person beide Layoutlinks.
- `.private/firebase/archive/`: Sicherung ersetzter lokaler Auslosungen.

**Für Firebase künftig diese private Konfiguration verwenden**, nicht
`data/config.json`. Die alten Dateien unter `data/` und `site/data.js`
bleiben ausschließlich für die beiden Varianten ohne Firebase bestehen.
Neue geschützte Auslosungen werden nicht dorthin geschrieben.

## 3. Administratorverbindung einmalig einrichten

Unter **Project settings → Service accounts → Generate new private key**
einen Firebase-Admin-Schlüssel erzeugen und lokal in
`.private/service-account.json` ablegen. Niemals in `site/` speichern oder
auf GitHub hochladen. Der Schlüssel gibt weitreichenden Datenbankzugriff.

```powershell
python -m pip install -r requirements-firebase.txt
$env:GOOGLE_APPLICATION_CREDENTIALS = (Resolve-Path .private/service-account.json).Path
```

Die Umgebungsvariable gilt für dieses Terminalfenster. Nach einem Neustart
des Terminals erneut setzen. Ein Widerruf des Admin-Schlüssels erfordert
einen neuen Schlüssel für spätere Veröffentlichungen. Die persönlichen
Teilnehmerlinks ändern sich dadurch nicht.

## 4. Bereits vorhandene Auslosung erstmals veröffentlichen

`DEINE-PROJEKT-ID` durch die ID aus den Firebase-Projekteinstellungen ersetzen:

```powershell
python scripts/setup_wishes.py publish --project DEINE-PROJEKT-ID
```

Zuordnungen, Namen, Schlüssel und aktive Runde werden gemeinsam in einer
Transaktion geschrieben. Erst wenn alles erfolgreich ist, wird die Runde
aktiv. Ein identischer Wiederholungsaufruf verändert nichts.
Eine bereits andere aktive Runde wird ohne `--replace` nicht ersetzt.

Danach die persönlichen Links aus `.private/firebase/links.txt` einzeln
verteilen. Keine vollständige Linkliste veröffentlichen.

## 5. Neue Auslosung im selben Jahr

1. Teilnehmer und Ausschlüsse in `.private/firebase/config.json` prüfen.
2. Nur wenn eine Neuauslosung wirklich gewünscht ist:

```powershell
python scripts/setup_wishes.py draw --replace
python scripts/setup_wishes.py publish --project DEINE-PROJEKT-ID --replace
```

Die erste Zeile lost privat neu aus, berücksichtigt das echte Vorjahr und
archiviert die bisherige lokale Zuordnung. Die zweite veröffentlicht sie
bewusst in Firebase. **Kein GitHub-Push nötig.** Die öffentlichen alten
Vergleichsseiten werden nicht aktualisiert.

Offene Firebase-Seiten erkennen die neue aktive Revision und verbergen
die bisherige Zuordnung. Vor dem Öffnen wird der Name erneut bestätigt.
Alle Schreib-/Leserechte auf die alte Revision entfallen sofort serverseitig.
Die Links bleiben gleich. Die vorhandenen Wünsche desselben Jahres bleiben
erhalten. Reservierungen gehören zur Auslosungsrevision und beginnen nach
einer Neuauslosung bewusst leer; alte Reservierungen werden nicht auf neue
Schenkende übertragen. Deshalb nicht nach laufender Geschenkplanung leichtfertig neu auslosen.

## 6. Neues Jahr

In `.private/firebase/config.json` `year` und die Teilnehmer aktualisieren:

```powershell
python scripts/setup_wishes.py draw
python scripts/setup_wishes.py publish --project DEINE-PROJEKT-ID --replace
```

Das unmittelbar vorherige Jahr muss privat vorhanden sein; nur dieselbe
Zweierkombination wird ausgeschlossen. Neue Teilnehmer erhalten automatisch
neue Codes, bestehende behalten ihre. Neue Wunschlisten starten leer.
Das neue aktive Jahr wird automatisch auf den Webseiten angezeigt.
Die Linkliste enthält auch ausgeschiedene Personen, deren Zugang gesperrt
ist. Nur aktiven Personen Links verteilen.

Ohne vorhandenes Vorjahr ist bewusst `draw --first-year` möglich. Bei
unmöglichen Regeln beziehungsweise erreichter Suchgrenze erfolgt keine
Veröffentlichung. Selbstbeschenken bleibt ausgeschlossen.

Bei reiner Namensänderung vor der nächsten Jahresrunde:

```powershell
python scripts/setup_wishes.py rename "Alter Name" "Neuer Name"
```

Danach die private Jahreskonfiguration anpassen und eine neue Auslosung
erstellen. Der Code bleibt erhalten; historische Namen werden über Aliase
demselben Menschen zugeordnet. Bei Namensgleichheit müssen eindeutige Namen
verwendet werden, zum Beispiel Vorname plus Nachnamensinitiale.

## 7. Vorschau und Website veröffentlichen

```powershell
python -m http.server 8000 --directory site
```

Persönlichen Link lokal testen, indem nur die Adresse vor `#key=` durch
`http://localhost:8000/firebase.html` oder `/firebase-kurz.html` ersetzt wird.
Den Code behalten. ES-Module benötigen HTTP; nicht per `file://` öffnen.
Ohne Firebase-Konfiguration wird eine ehrliche Fehlermeldung angezeigt,
ohne vorgetäuschte Speicherung oder lokale Ersatzdaten.

Einmalig den Websitecode und die öffentlichen Firebase-Web-Konfigurationswerte
nach Prüfung auf GitHub hochladen. Spätere reine Firebase-Auslosungen,
Wünsche und Reservierungen benötigen keinen Website-Upload.
Der GitHub-Workflow „Jahrgang auslosen (ohne Firebase)“ gehört ausdrücklich
zu den alten Vergleichsseiten und darf nicht für geheime Runden verwendet werden.

## Wichtige Grenze beim Parallelvergleich

Die beiden Seiten ohne Firebase enthalten weiterhin die bisherige öffentliche
Auslosung. Auch die Git-Historie kann diese enthalten. Firebase macht früher
veröffentlichte Ergebnisse nicht rückwirkend geheim. Erst eine neue,
ausschließlich privat erstellte und in Firebase veröffentlichte Auslosung
ist von diesen alten Daten unabhängig. Die Firebase-Seiten laden niemals
`data.js` und besitzen keine freie Namensauswahl.

## Tests

```powershell
python -m unittest discover -s tests -v
npm install
npm test
npm run test:rules
```

Regel- und Veröffentlichungstests brauchen Java 21+ für den lokalen
Firestore-Emulator. Sie verwenden ausschließlich das isolierte Projekt
`demo-wichteln`, kein echtes Firebase-Projekt. `test:rules` prüft auch die
atomare Veröffentlichung über das echte Admin-SDK gegen den Emulator.
Die Browser-Testverbindung ist nur auf localhost mit einer `demo-`-Projekt-ID
möglich; im Produktivbetrieb bleibt `emulators: null`.

Dokumentation: https://firebase.google.com/docs/web/setup ·
https://firebase.google.com/docs/auth/web/anonymous-auth ·
https://firebase.google.com/docs/firestore/security/get-started ·
https://firebase.google.com/docs/admin/setup
