/**
 * Generates a fresh Daily News Briefing using the Gemini API (with Google
 * Search grounding) and writes it to public/data/latest.json, which
 * scripts/send-email.ts then reads to compose and send the daily email.
 *
 * Runs both locally ("npm run generate", reading GEMINI_API_KEY from
 * .env.local) and inside the GitHub Actions workflow once a day at 08:00
 * (Europe/Berlin) (GEMINI_API_KEY comes from a repo secret there - see
 * .github/workflows/deploy.yml).
 */
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import type { NewsBrief, CategoryId } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local'), override: true });

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'latest.json');
const MODEL = 'gemini-3.1-pro-preview';

const CATEGORY_IDS: CategoryId[] = [
  'world-news',
  'german-politics',
  'ukraine-war',
  'middle-east-conflict',
  'global-health',
];

const CATEGORY_NAMES: Record<CategoryId, string> = {
  'world-news': 'Weltnachrichten',
  'german-politics': 'Bundespolitik Deutschland',
  'ukraine-war': 'Krieg in der Ukraine',
  'middle-east-conflict': 'Nahost-Konflikt',
  'global-health': 'Globale Gesundheit',
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

  // Single daily edition, always the 08:00 (Europe/Berlin) run.
  const schedule = '08:00';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 503 || status === 429;
}

/** Retries transient Gemini API errors (503 "overloaded", 429 rate limit)
 * every 5 minutes, up to 4 attempts total. The workflow starts at 07:45
 * (Europe/Berlin), so the worst case (3 retries) lands exactly at 08:00 -
 * right when the email is due anyway. */
async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 4,
  delaysMs = [300_000, 300_000, 300_000],
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || !isTransientError(err)) throw err;
      const delay = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1];
      console.warn(`Gemini-API vorübergehend nicht verfügbar (Versuch ${attempt}/${attempts}), erneuter Versuch in ${delay / 1000}s …`);
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}

/** Parses the model's JSON response defensively: strips markdown code
 * fences some models wrap JSON in despite responseMimeType/responseSchema,
 * and falls back to extracting the outermost {...} block if direct parsing
 * fails. On failure, logs the full raw response (not just the few-char
 * snippet JSON.parse's own error gives you) so a bad response is actually
 * debuggable from the Actions log instead of a guessing game. */
function parseModelJson(rawText: string): any {
  const text = rawText.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidates = [text, fenced?.[1]?.trim()].filter(Boolean) as string[];

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  console.error('Konnte die Modellantwort nicht als JSON parsen. Vollständige Rohantwort:');
  console.error(rawText);
  throw new Error('Modellantwort war kein valides JSON (siehe Rohantwort oben im Log).');
}

function buildPrompt(date: string, schedule: string): string {
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
3. ukraine-war (Krieg in der Ukraine): militärische Lage, Diplomatie, humanitäre Lage.
4. middle-east-conflict (Nahost-Konflikt): Gaza, Israel, Libanon, regionale Entwicklungen.
5. global-health (Globale Gesundheit): Ausbrüche, WHO-Meldungen, Pandemien, Gesundheitspolitik.

Pro Kategorie:
- headline: prägnante, professionelle Schlagzeile auf Deutsch (max. 15 Wörter).
- brief: sachlicher, informativer Bericht auf Deutsch (4-6 Sätze, konkrete Zahlen/Fakten wo vorhanden).
- whyRelevant: ein Satz (max. 20 Wörter), der die Relevanz einordnet.
- sources: 1-3 echte Quellen (title = Name des Mediums, url = direkte echte Artikel-URL). Erfinde
  niemals URLs. Wenn du zu einer Kategorie nichts Verlässliches findest, sage das ehrlich in
  "brief" statt eine Nachricht zu erfinden.

executiveSummary: exakt 5 kurze, eigenständige Sätze (kein Markdown, keine Aufzählungszeichen -
das Frontend fügt die Bullet-Punkte selbst hinzu), einer pro Kategorie, in der Reihenfolge
Weltnachrichten, Bundespolitik Deutschland, Krieg in der Ukraine, Nahost-Konflikt, Globale Gesundheit.
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

  const ai = new GoogleGenAI({ apiKey });

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt(date, schedule),
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
    }),
  );

  const text = response.text;
  if (!text) throw new Error('Leere Antwort von Gemini erhalten.');

  const parsed = parseModelJson(text);
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
