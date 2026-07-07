<div align="center">

# 📰 Daily News Briefing

![Node](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/automation-GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)

</div>

KI-generierte Daily News Briefings in sechs Kategorien (Weltnachrichten, Bundespolitik
Deutschland, Globale Gesundheit, Krieg in der Ukraine, Nahost-Konflikt, Gute Nachricht des
Tages) – ergänzt um eine "Heute auf einen Blick"-Ansicht mit dem Wetter in Berlin und deinen
heutigen Google-Kalender-Terminen. Einmal täglich automatisch per E-Mail, komplett kostenlos
über GitHub Actions.

## Wie das funktioniert

Es gibt **keinen** dauerhaft laufenden Server. Alles passiert in einer GitHub Action
(`.github/workflows/deploy.yml`):

1. Die Action läuft stündlich (Cron `50 * * * *`), prüft aber sofort die aktuelle
   Uhrzeit in Berlin und bricht ab, außer es liegt im Sendefenster. Das Fenster
   umfasst drei Versuche im Stundenabstand: `SEND_HOUR-1`, `SEND_HOUR` und
   `SEND_HOUR+1` Uhr (Standard: `SEND_HOUR = 8`, also 07/08/09 Uhr) – siehe
   `env.SEND_HOUR` ganz oben in `deploy.yml`. Das läuft automatisch über
   Sommer-/Winterzeit hinweg korrekt, ohne dass du etwas umstellen musst.
2. Ein Dedupe-Marker (`public/data/last-sent-date.txt`) sorgt dafür, dass an einem
   Tag nur einmal versendet wird, selbst wenn mehrere Versuche im Fenster liegen –
   die zwei zusätzlichen Versuche sind reine Retries für den Fall, dass GitHub den
   ersten Lauf verspätet startet oder die Gemini-API kurz ausfällt.
3. Im ersten passenden Lauf ruft `scripts/generate-briefing.ts` die Gemini-API mit
   Google-Suche (Grounding) auf und lässt daraus die sechs Kategorien plus Executive
   Summary erstellen – mit einer Präferenz für Die Zeit, Tagesschau, BBC,
   Al Jazeera, New York Times, Der Spiegel, CNN und (für die gute Nachricht des Tages)
   Good News Network / Positive News als Quellen. Liefert Gemini ausnahmsweise
   kaputtes JSON zurück, wird die Generierung automatisch mit einem frischen API-Call
   wiederholt, statt den ganzen Lauf abzubrechen.
4. Parallel dazu (unabhängig von Gemini, siehe `scripts/weather.ts` und
   `scripts/calendar.ts`) werden das heutige Berlin-Wetter über die kostenlose
   [Open-Meteo](https://open-meteo.com/)-API und – falls eingerichtet – deine
   heutigen Google-Kalender-Termine abgerufen. Beide sind rein additiv: schlägt
   einer der beiden Abrufe fehl oder ist nicht konfiguriert, wird die jeweilige
   Karte in der E-Mail einfach weggelassen, der Rest des Briefings ist davon
   unberührt.
5. Das Ergebnis landet in `public/data/latest.json` und wird ins Repo
   zurückcommittet – nicht für Hosting, sondern damit die nächste Ausgabe weiß, was
   gestern schon berichtet wurde (`loadPreviousEdition()`).
6. Sobald die Zielzeit (`SEND_HOUR:00`) erreicht ist, verschickt
   `scripts/send-email.ts` das Briefing als HTML-E-Mail per Gmail SMTP.
7. Jeder Versuch – erfolgreich oder nicht – wird mit Datum, Uhrzeit und Ergebnis in
   `logs/send-log.txt` protokolliert, direkt im Repo einsehbar. Schlagen alle drei
   Versuche im Fenster fehl, verschickt `scripts/notify-failure.ts` zusätzlich eine
   kurze Alarm-Mail, damit ein Ausfall nicht unbemerkt bleibt.

Im Repo liegt außerdem eine kleine React/Vite-Web-App (`src/`), die dieselbe
`public/data/latest.json` anzeigen kann (`npm run dev` bzw. `npm run build`) –
inklusive derselben Wetter-/Kalender-Karten und der Kategorie "Gute Nachricht des
Tages". Sie wird von der Action aktuell **nicht** automatisch gehostet/deployed – die
Kernfunktion dieses Repos ist der tägliche E-Mail-Versand, die Web-App ist optional
für lokale Nutzung.

## Was im Briefing steht

- **Heute auf einen Blick**: Wetter in Berlin (Temperaturspanne, Regenwahrscheinlichkeit,
  passendes Icon) – die ganze Karte ist anklickbar und führt zur Vorhersage auf
  wetter.com. Direkt darunter, falls eingerichtet, deine heutigen Google-Kalender-Termine.
- **Executive Summary**: fünf Sätze, einer pro "ernster" Kategorie (Weltnachrichten,
  Bundespolitik, Ukraine, Nahost, Gesundheit) – unverändert wie bisher.
- **Fünf Nachrichtenkategorien** wie bisher: Weltnachrichten, Bundespolitik Deutschland,
  Krieg in der Ukraine, Nahost-Konflikt, Globale Gesundheit.
- **Gute Nachricht des Tages** (letzte Kategorie, farblich abgesetzt in Gold/Amber): genau
  eine echte, belegte positive Meldung – z. B. eine wissenschaftliche oder medizinische
  Durchbruchsmeldung, eine Verbesserung bei Umwelt/Klima, eine Rettungsaktion oder eine
  besondere Geste der Freundlichkeit. Bewusst kein Ausgleich um jeden Preis: Gemini soll
  ehrlich bleiben und keine Meldung erfinden.

## Sendezeit anpassen (z. B. für einen Testlauf)

`env.SEND_HOUR` in `.github/workflows/deploy.yml` ist die einzige Stelle, die du
ändern musst – sie steuert automatisch das Sendefenster, den letzten Retry, die
Wartezeit, die im Briefing angezeigte Uhrzeit und den Text der Alarm-Mail mit.
Für einen einmaligen Test z. B. auf `'17'` setzen, testen, danach unbedingt wieder
auf `'8'` zurücksetzen. Alternativ jederzeit ohne Code-Änderung: im Actions-Tab
**Run workflow** klicken – das sendet sofort, unabhängig vom Sendefenster.

Der Versand bleibt wie bisher: einmal täglich per Gmail, standardmäßig um 08:00 Uhr
(Europe/Berlin). An dieser Grundmechanik hat sich durch Wetter, Kalender und die
neue Kategorie nichts geändert.

## GitHub-Einrichtung – Schritt für Schritt

### 1. Gemini API Key besorgen

1. Gehe zu [aistudio.google.com/apikey](https://aistudio.google.com/apikey) und
   erstelle einen kostenlosen API Key (Google-Konto genügt).
2. Kopiere den Key – du brauchst ihn gleich als GitHub Secret.

### 2. Gmail-App-Passwort einrichten

Der E-Mail-Versand läuft über Gmail SMTP mit einem **App-Passwort** (nie dein
echtes Konto-Passwort):

1. Voraussetzung: 2-Faktor-Authentifizierung ist auf dem Gmail-Konto aktiviert,
   das versenden soll.
2. Gehe zu [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   und erstelle ein neues App-Passwort (App-Name frei wählbar, z. B. "News
   Briefing").
3. Kopiere das generierte 16-stellige Passwort – du brauchst es gleich als
   GitHub Secret.

### 3. Google-Kalender einrichten (optional, für die Termine-Karte)

Die Action läuft unbeaufsichtigt, ohne Browser und ohne Login – dafür eignet sich ein
Google Cloud **Service Account** am besten (kein ablaufendes Token, kein erneuter
Consent-Flow nötig):

1. Öffne die [Google Cloud Console](https://console.cloud.google.com/), lege ein
   (kostenloses) Projekt an oder wähle ein bestehendes.
2. Aktiviere dort die **Google Calendar API** (Suche im Marketplace nach "Google
   Calendar API" → Aktivieren).
3. Gehe zu **IAM & Verwaltung → Dienstkonten → Dienstkonto erstellen**. Name ist
   frei wählbar (z. B. "news-briefing-calendar"). Rollen/Zugriff kannst du
   überspringen – das Konto braucht keine Projektrechte, nur Zugriff auf deinen
   Kalender (siehe nächster Schritt).
4. Öffne das neu erstellte Dienstkonto → Tab **Keys** → **Add Key → Create new
   key** → Typ **JSON**. Die Datei wird heruntergeladen – das ist dein
   `GOOGLE_SERVICE_ACCOUNT_KEY` (kompletter Dateiinhalt, unverändert).
5. Kopiere die Dienstkonto-E-Mail-Adresse (endet auf
   `...@<projekt>.iam.gserviceaccount.com`, steht auch im JSON als `client_email`).
6. Gehe in [Google Calendar](https://calendar.google.com/) → Einstellungen deines
   Kalenders → **Für bestimmte Personen freigeben** → füge die Dienstkonto-E-Mail
   hinzu, Berechtigung **"Alle Termininformationen ansehen"** (Lesezugriff genügt).
7. Deine `GOOGLE_CALENDAR_ID` ist in der Regel einfach deine Gmail-Adresse (die des
   freigegebenen Kalenders) – steht auch unter "Kalender integrieren" in den
   Kalendereinstellungen als "Kalender-ID".

Lässt du diesen Schritt aus, funktioniert alles andere unverändert weiter – es
erscheint dann nur keine Termine-Karte in der E-Mail.

### 4. Wetter

Braucht **keine** Einrichtung: Das Wetter für Berlin kommt kostenlos und ohne API
Key von [Open-Meteo](https://open-meteo.com/). Die Wetter-Karte in der E-Mail
verlinkt beim Klick auf die Berlin-Vorhersage von wetter.com.

### 5. Dateien in dein Repo pushen

Falls dein Repo schon existiert, aber noch leer ist:

```bash
cd news-briefing
git init
git add .
git commit -m "Initial commit: Daily News Briefing"
git branch -M main
git remote add origin https://github.com/<dein-user>/<dein-repo>.git
git push -u origin main
```

### 6. GitHub Secrets hinterlegen

Im Repo unter **Settings → Secrets and variables → Actions → New repository
secret** die folgenden Secrets anlegen:

| Secret | Pflicht? | Wert |
| --- | --- | --- |
| `GEMINI_API_KEY` | ja | Key aus Schritt 1 |
| `GMAIL_USER` | ja | Die sendende Gmail-Adresse |
| `GMAIL_APP_PASSWORD` | ja | App-Passwort aus Schritt 2 |
| `RECIPIENT_EMAIL` | ja | Empfänger-Adresse (kann identisch mit `GMAIL_USER` sein) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | optional | kompletter JSON-Key-Inhalt aus Schritt 3.4 |
| `GOOGLE_CALENDAR_ID` | optional | Kalender-ID aus Schritt 3.7 |

Die beiden Google-Kalender-Secrets sind optional – ohne sie läuft alles wie gehabt,
nur ohne Termine-Karte. Anschließend im Actions-Tab **Run workflow** klicken, um
sofort eine Test-Mail zu bekommen, unabhängig vom Sendefenster.

## Unterschiede zum ursprünglichen Entwurf

Falls du dich fragst, warum das hier anders aussieht als der ursprüngliche
AI-Studio-Export:

- **`server.ts` (Express) wurde entfernt.** Der Entwurf ging von einem
  dauerhaft laufenden Node-Server aus, der bei jedem Klick live die Gemini-API
  aufruft. Das lässt sich mit der kostenlosen GitHub-Actions-Variante nicht
  umsetzen. Stattdessen übernimmt jetzt die oben beschriebene GitHub Action die
  Generierung und den Versand.
- **`src/types.ts`, `src/mockData.ts`, `src/App.tsx`, `src/main.tsx`,
  `src/index.css`, `src/vite-env.d.ts` fehlten im Upload** und wurden neu
  erstellt (die drei Hilfsskripte, die auf sie verwiesen, waren nicht Teil der
  eigentlichen App).
- **`fix.js`, `fix_mock.js`, `reorder.js`, `test-html.js`** waren unvollständige
  bzw. fehlerhafte Einweg-Skripte aus einer vorherigen Bearbeitung (u. a. mit
  `eval()` und abgebrochener Logik) und wurden nicht übernommen.
- **`@types/react` / `@types/react-dom` fehlten** in der `package.json` – ohne
  sie schlägt die TypeScript-Prüfung fehl. Wurden ergänzt.
- **Wetter (Open-Meteo), Google-Kalender-Termine und die Kategorie "Gute Nachricht
  des Tages" wurden ergänzt** (`scripts/weather.ts`, `scripts/calendar.ts`, sowie
  Erweiterungen in `src/types.ts`, `scripts/generate-briefing.ts` und
  `scripts/send-email.ts`). Beide Zusatzquellen sind optional/fehlertolerant und
  ändern nichts an Sendezeit oder Versandweg (weiterhin einmal täglich per Gmail,
  standardmäßig 08:00 Uhr Europe/Berlin).
