<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Daily News Briefing

Eine iOS-artig gestaltete Web-App mit KI-generierten Daily News Briefings in fünf
Kategorien (Weltnachrichten, Bundespolitik Deutschland, Globale Gesundheit, Krieg in
der Ukraine, Nahost-Konflikt). Wird automatisch 3x täglich (08:00, 14:00, 20:00 Uhr,
Europe/Berlin) über GitHub Actions aktualisiert und komplett kostenlos über GitHub
Pages gehostet.

## Wie das funktioniert

Es gibt **keinen** Server, der bei jedem Seitenaufruf live die Gemini-API anfragt –
GitHub Pages kann nur statische Dateien ausliefern, keinen Node/Express-Server
betreiben. Stattdessen:

1. Eine GitHub Action läuft stündlich, prüft aber sofort die aktuelle Uhrzeit in
   Berlin und bricht ab, außer es ist ungefähr 8, 14 oder 20 Uhr (das läuft
   automatisch über Sommer-/Winterzeit hinweg korrekt, ohne dass du etwas
   umstellen musst).
2. Zu den drei Slots ruft ein Node-Skript (`scripts/generate-briefing.ts`) die
   Gemini-API mit Google-Suche (Grounding) auf und lässt daraus die fünf
   Kategorien plus Executive Summary erstellen – mit einer Präferenz für Die
   Zeit, Tagesschau, BBC, Al Jazeera, New York Times, Der Spiegel und CNN als
   Quellen.
3. Das Ergebnis landet in `public/data/latest.json`, die App wird gebaut
   (`vite build`) und automatisch auf GitHub Pages veröffentlicht.
4. Die Web-App selbst lädt beim Öffnen nur diese statische JSON-Datei – schnell,
   kostenlos, ohne dass dein API-Key jemals im Browser sichtbar wird.

## Unterschiede zum ursprünglichen Entwurf

Falls du dich fragst, warum das hier anders aussieht als der ursprüngliche
AI-Studio-Export:

- **`server.ts` (Express) wurde entfernt.** Der Entwurf ging von einem
  dauerhaft laufenden Node-Server aus, der bei jedem Klick live die Gemini-API
  aufruft. Das lässt sich mit der kostenlosen GitHub-Pages-Variante nicht
  umsetzen (nur statisches Hosting). Stattdessen übernimmt jetzt die oben
  beschriebene GitHub Action die Generierung.
- **`src/types.ts`, `src/mockData.ts`, `src/App.tsx`, `src/main.tsx`,
  `src/index.css`, `src/vite-env.d.ts` fehlten im Upload** und wurden neu
  erstellt (die drei Hilfsskripte, die auf sie verwiesen, waren nicht Teil der
  eigentlichen App).
- **`fix.js`, `fix_mock.js`, `reorder.js`, `test-html.js`** waren unvollständige
  bzw. fehlerhafte Einweg-Skripte aus einer vorherigen Bearbeitung (u. a. mit
  `eval()` und abgebrochener Logik) und wurden nicht übernommen.
- **`@types/react` / `@types/react-dom` fehlten** in der `package.json` – ohne
  sie schlägt die TypeScript-Prüfung fehl. Wurden ergänzt.
- Alles wurde lokal getestet: `npm install`, `npx tsc --noEmit` und
  `npx vite build` laufen fehlerfrei durch; die gebaute Seite wurde per
  `vite preview` angesteuert und ausgeliefert.

## GitHub-Einrichtung – Schritt für Schritt

### 1. Gemini API Key besorgen

1. Gehe zu [aistudio.google.com/apikey](https://aistudio.google.com/apikey) und
   erstelle einen kostenlosen API Key (Google-Konto genügt).
2. Kopiere den Key – du brauchst ihn gleich als GitHub Secret.

### 2. Dateien in dein Repo pushen

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

(`<dein-user>` und `<dein-repo>` durch deine echten Werte ersetzen.)

### 3. API Key als Secret hinterlegen

1. Im Repo auf GitHub: **Settings → Secrets and variables → Actions**.
2. **New repository secret** klicken.
3. Name: `GEMINI_API_KEY`, Wert: dein Key aus Schritt 1.
4. **Add secret**.

### 4. GitHub Pages aktivieren

1. **Settings → Pages**.
2. Unter **Build and deployment → Source** auf **GitHub Actions** stellen
   (nicht "Deploy from a branch").
3. Das war's – kein weiterer Schritt nötig, der Workflow übernimmt den Rest.

### 5. Repo-Sichtbarkeit prüfen

Damit GitHub Pages und die Actions-Minuten komplett kostenlos bleiben, muss das
Repo **öffentlich (public)** sein (bei privaten Repos ist Pages Teil von
GitHub Pro). Falls dein Repo privat ist: **Settings → General → Danger Zone →
Change visibility → Public**.

### 6. Ersten Lauf testen

1. Im Reiter **Actions** den Workflow "Generate briefing & deploy to GitHub
   Pages" auswählen.
2. **Run workflow** klicken (das funktioniert manuell jederzeit, unabhängig von
   der Uhrzeit – der Zeit-Check gilt nur für die automatischen stündlichen
   Läufe).
3. Nach ein bis zwei Minuten sollte der Lauf grün sein. Die URL deiner Seite
   findest du unter **Settings → Pages** ("Your site is live at …") bzw. im
   Log des Deploy-Jobs.

Ab jetzt aktualisiert sich die Seite automatisch um 8, 14 und 20 Uhr
(Europe/Berlin) – ganz ohne dein Zutun.

## Lokale Entwicklung

**Voraussetzung:** Node.js 20+

```bash
npm install
cp .env.local.example .env.local   # dann echten GEMINI_API_KEY eintragen
npm run generate                    # erzeugt public/data/latest.json
npm run dev                         # startet die App unter http://localhost:5173
```

Weitere Befehle:

- `npm run build` – produktionsreifer Build nach `dist/`
- `npm run preview` – gebaute Version lokal ansehen
- `npm run lint` – TypeScript-Check ohne Build

## Troubleshooting

- **Workflow schlägt bei "Generate briefing" fehl:** meist ein falscher oder
  fehlender `GEMINI_API_KEY` (Schritt 3) oder ein Tippfehler im Secret-Namen –
  er muss exakt `GEMINI_API_KEY` heißen.
- **Seite zeigt nur die Beispiel-/Platzhalter-Daten:** Der Workflow ist noch
  nie erfolgreich durchgelaufen. Einmal manuell über **Run workflow**
  anstoßen (Schritt 6).
- **404 auf GitHub Pages:** Prüfe, ob unter **Settings → Pages** wirklich
  "GitHub Actions" als Quelle ausgewählt ist, und ob der Deploy-Job im Actions-
  Reiter grün ist.
