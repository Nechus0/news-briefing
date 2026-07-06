/**
 * Generates a fresh Daily News Briefing using the Gemini API (with Google
 * Search grounding) and writes it to public/data/latest.json, which the
 * built static site (public/ is copied into dist/ by Vite) fetches at
 * runtime.
 *
 * Runs both locally ("npm run generate", reading GEMINI_API_KEY from
 * .env.local) and inside the GitHub Actions workflow three times a day
 * (GEMINI_API_KEY comes from a repo secret there - see
 * .github/workflows/deploy.yml).
 */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import type { NewsBrief, CategoryId } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local for local development (npm run generate). In GitHub
// Actions, GEMINI_API_KEY is injected directly as an env var by the
// workflow, and these files simply won't exist - dotenv silently no-ops.
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'latest.json');
const MODEL = 'gemini-3.5-flash';

const CATEGORY_IDS: CategoryId[] = [
  'world-news',
  'german-politics',
  'global-health',
  'ukraine-war',
  'middle-east-conflict',
];

const CATEGORY_NAMES: Record<CategoryId, string> = {
  'world-news': 'Weltnachrichten',
  'german-politics': 'Bundespolitik Deutschland',
  'global-health': 'Globale Gesundheit',
  'ukraine-war': 'Krieg in der Ukraine',
  'middle-east-conflict': 'Nahost-Konflikt',
};

const PREFERRED_SOURCES = [
  'Die Zeit (zeit.de)',
  'Tagesschau (tagesschau.de)',
  'BBC (bbc.com/news)',
  'Al Jazeera (aljazeera.com)',
  'New York Times (nytimes.com)',
  'Der Spiegel (spiegel.de)',
  'CNN (cnn.com)',
];

function currentBerlinSlot(): { date: string; schedule: string; formattedDate: string } {
  const now = new Date();
  const berlinNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  const hour = berlinNow.getHours();

  // Snap to the nearest of the three daily slots for labelling purposes.
  let schedule = '08:00';
  if (hour >= 17) schedule = '20:00';
  else if (hour >= 11) schedule = '14:00';

  const yyyy = berlinNow.getFullYear();
  const mm = String(berlinNow.getMonth() + 1).padStart(2, '0');
  const dd = String(berlinNow.getDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;

  const formattedDate = berlinNow.toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return { date, schedule, formattedDate };
}

/** Best-effort fetch of the currently published edition, purely so Gemini
 * can avoid repeating itself. Never throws - continuity is a nice-to-have. */
async function fetchPreviousEdition(): Promise<NewsBrief | null> {
  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo", set automatically in Actions
  if (!repo) return null;
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;

  const candidateUrls = [
    `https://${owner}.github.io/${name}/data/latest.json`,
    `https://${owner}.github.io/data/latest.json`, // in case repo is a user/org page (owner.github.io)
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return (await res.json()) as NewsBrief;
    } catch {
      // ignore and try next candidate / give up silently
    }
  }
  return null;
}

function buildPrompt(date: string, schedule: string, previous: NewsBrief | null): string {
  const previousContext = previous
    ? `Vorherige Ausgabe (${previous.formattedDate}, ${previous.schedule} Uhr) zur Einordnung, was schon berichtet wurde - wiederhole nichts unnötig, sondern arbeite heraus was sich seitdem geändert hat:\n${JSON.stringify(
        {
          executiveSummary: previous.executiveSummary,
          categories: previous.categories?.map((c) => ({ id: c.id, headline: c.headline })),
        },
        null,
        2,
      )}`
    : 'Es gibt keine vorherige Ausgabe (erster Lauf oder nicht erreichbar) - erstelle das Briefing unabhängig davon.';

  return `
Generiere eine umfassende, hochprofessionelle tägliche Nachrichtenzusammenfassung vollständig in
deutscher Sprache für das Datum ${date}, Update-Slot ${schedule} Uhr (Europe/Berlin).

Nutze Google Search, um aktuelle, echte Nachrichten zu recherchieren. Bevorzuge dabei explizit
diese Quellen, wenn sie zum Thema passende Berichterstattung haben (nutze ihre Original-URLs):
${PREFERRED_SOURCES.map((s) => `- ${s}`).join('\n')}
Andere seriöse Quellen sind erlaubt, falls diese sieben zu einem Thema nichts Passendes berichten.

Du musst genau diese fünf Kategorien abdecken (deutsche Bezeichnung in Klammern):
1. world-news (Weltnachrichten): wichtige globale Entwicklungen, Geopolitik, internationale Abkommen.
2. german-politics (Bundespolitik Deutschland): Bundestag, Regierungskoalition, Gesetzesvorhaben.
3. global-health (Globale Gesundheit): Ausbrüche, WHO-Meldungen, Pandemien, Gesundheitspolitik.
4. ukraine-war (Krieg in der Ukraine): militärische Lage, Diplomatie, humanitäre Lage.
5. middle-east-conflict (Nahost-Konflikt): Gaza, Israel, Libanon, regionale Entwicklungen.

Pro Kategorie:
- headline: prägnante, professionelle Schlagzeile auf Deutsch (max. 15 Wörter).
- brief: sachlicher, informativer Bericht auf Deutsch (4-6 Sätze, konkrete Zahlen/Fakten wo vorhanden).
- whyRelevant: ein Satz (max. 20 Wörter), der die Relevanz einordnet.
- sources: 1-3 echte Quellen (title = Name des Mediums, url = direkte echte Artikel-URL). Erfinde
  niemals URLs. Wenn du zu einer Kategorie nichts Verlässliches findest, sage das ehrlich in
  "brief" statt eine Nachricht zu erfinden.

executiveSummary: exakt 5 kurze, eigenständige Sätze (kein Markdown, keine Aufzählungszeichen -
das Frontend fügt die Bullet-Punkte selbst hinzu), einer pro Kategorie, in der Reihenfolge
Weltnachrichten, Bundespolitik Deutschland, Globale Gesundheit, Krieg in der Ukraine, Nahost-Konflikt.

${previousContext}
`.trim();
}

async function generate(): Promise<NewsBrief> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'DEIN_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY ist nicht gesetzt. Lokal: .env.local anlegen (siehe .env.local.example). ' +
        'In GitHub Actions: Repo-Secret "GEMINI_API_KEY" hinterlegen.',
    );
  }

  const { date, schedule, formattedDate } = currentBerlinSlot();
  const previous = await fetchPreviousEdition();

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(date, schedule, previous),
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.ARRAY,
            description: 'Genau 5 kurze Sätze, einer pro Kategorie, ohne Bullet-Zeichen.',
            items: { type: Type.STRING },
          },
          categories: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: `Genau einer von: ${CATEGORY_IDS.join(', ')}`,
                },
                name: { type: Type.STRING },
                headline: { type: Type.STRING },
                brief: { type: Type.STRING },
                whyRelevant: { type: Type.STRING },
                sources: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      url: { type: Type.STRING },
                    },
                    required: ['title', 'url'],
                  },
                },
              },
              required: ['id', 'name', 'headline', 'brief', 'whyRelevant', 'sources'],
            },
          },
        },
        required: ['executiveSummary', 'categories'],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error('Leere Antwort von Gemini erhalten.');

  const parsed = JSON.parse(text.trim());
  const foundCategories: any[] = parsed.categories ?? [];

  const finalCategories = CATEGORY_IDS.map((id) => {
    const found = foundCategories.find((c) => c.id === id);
    if (found) return found;
    // Should be rare given the schema, but never let a missing category break the build.
    return {
      id,
      name: CATEGORY_NAMES[id],
      headline: 'Keine wesentlichen neuen Entwicklungen erfasst.',
      brief: 'Für diese Kategorie konnten in diesem Durchlauf keine verlässlichen aktuellen Meldungen ermittelt werden.',
      whyRelevant: '',
      sources: [],
    };
  });

  const executiveSummary: string[] = Array.isArray(parsed.executiveSummary)
    ? parsed.executiveSummary
    : String(parsed.executiveSummary ?? '')
        .split('\n')
        .map((s) => s.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean);

  const brief: NewsBrief = {
    id: `${date}-${schedule}`,
    timestamp: new Date().toISOString(),
    formattedDate,
    schedule,
    executiveSummary,
    categories: finalCategories,
  };

  return brief;
}

async function main() {
  console.log('Generiere Daily News Briefing …');
  const brief = await generate();

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(brief, null, 2), 'utf8');
  console.log(`Geschrieben: ${OUTPUT_PATH}`);
  console.log(`Slot: ${brief.formattedDate}, ${brief.schedule} Uhr`);
}

main().catch((err) => {
  console.error('Generierung fehlgeschlagen:', err);
  process.exitCode = 1;
});
