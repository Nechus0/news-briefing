<div align="center">

# 📰 Daily News Briefing

![Node](https://img.shields.io/badge/node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Gemini](https://img.shields.io/badge/AI-Gemini-8E75B2?style=flat-square&logo=googlegemini&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/automation-GitHub%20Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)

</div>

KI-generierte Daily News Briefings in fünf Kategorien (Weltnachrichten, Bundespolitik
Deutschland, Globale Gesundheit, Krieg in der Ukraine, Nahost-Konflikt) – einmal
täglich automatisch per E-Mail, komplett kostenlos über GitHub Actions.

## Wie das funktioniert

Es gibt **keinen** dauerhaft laufenden Server. Alles passiert in einer GitHub Action
(`.github/workflows/deploy.yml`):

1. Die Action läuft stündlich (Cron `45 * * * *`), prüft aber sofort die aktuelle
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
   Google-Suche (Grounding) auf und lässt daraus die fünf Kategorien plus Executive
   Summary erstellen – mit einer Präferenz für Die Zeit, Tagesschau, BBC,
   Al Jazeera, New York Times, Der Spiegel und CNN als Quellen. Liefert Gemini
   ausnahmsweise kaputtes JSON zurück, wird die Generierung automatisch mit einem
   frischen API-Call wiederholt, statt den ganzen Lauf abzubrechen.
4. Das Ergebnis landet in `public/data/latest.json` und wird ins Repo
   zurückcommittet – nicht für Hosting, sondern damit die nächste Ausgabe weiß, was
   gestern schon berichtet wurde (`loadPreviousEdition()`).
5. Sobald die Zielzeit (`SEND_HOUR:00`) erreicht ist, verschickt
   `scripts/send-email.ts` das Briefing als HTML-E-Mail per Gmail SMTP.
6. Jeder Versuch – erfolgreich oder nicht – wird mit Datum, Uhrzeit und Ergebnis in
   `logs/send-log.txt` protokolliert, direkt im Repo einsehbar. Schlagen alle drei
   Versuche im Fenster fehl, verschickt `scripts/notify-failure.ts` zusätzlich eine
   kurze Alarm-Mail, damit ein Ausfall nicht unbemerkt bleibt.

Im Repo liegt außerdem eine kleine React/Vite-Web-App (`src/`), die dieselbe
`public/data/latest.json` anzeigen kann (`npm run dev` bzw. `npm run build`).
Sie wird von der Action aktuell **nicht** automatisch gehostet/deployed – die
Kernfunktion dieses Repos ist der tägliche E-Mail-Versand, die Web-App ist optional
für lokale Nutzung.

## Sendezeit anpassen (z. B. für einen Testlauf)

`env.SEND_HOUR` in `.github/workflows/deploy.yml` ist die einzige Stelle, die du
ändern musst – sie steuert automatisch das Sendefenster, den letzten Retry, die
Wartezeit, die im Briefing angezeigte Uhrzeit und den Text der Alarm-Mail mit.
Für einen einmaligen Test z. B. auf `'17'` setzen, testen, danach unbedingt wieder
auf `'8'` zurücksetzen. Alternativ jederzeit ohne Code-Änderung: im Actions-Tab
**Run workflow** klicken – das sendet sofort, unabhängig vom Sendefenster.

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

### 3. Dateien in dein Repo pushen

Falls dein Repo schon existiert, aber noch leer ist:

```bash
cd news-briefing
git init
git add .
git commit -m "Initial commit: Daily News Briefing"
git branch -M main
git remote add origin https://github.com/<dein-user>/<dein-repo>.git
git push -u origin main
