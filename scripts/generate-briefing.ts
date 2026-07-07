/**
 * Generates a fresh Daily News Briefing using the Gemini API (with Google
 * Search grounding) and writes it to public/data/latest.json, which
 * scripts/send-email.ts then reads to compose and send the daily email.
 *
 * Runs both locally ("npm run generate", reading GEMINI_API_KEY from
 * .env.local) and inside the GitHub Actions workflow, once a day around
 * env.SEND_HOUR (Europe/Berlin) (GEMINI_API_KEY comes from a repo secret
 * there - see .github/workflows/deploy.yml, which also sets SEND_HOUR).
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
  'Le Monde (lemonde.fr)',
  'WHO (who.int)',
  'Health Policy Watch (healthpolicy-watch.news)',
];

// Pro Kategorie ein paar naheliegende Beispielquellen aus der Liste oben,
// damit sich das Modell nicht auf eine einzelne Publikation einschießt
// (in der Praxis kam sonst überproportional viel Al Jazeera vor).
const CATEGORY_SOURCE_HINTS: Record<CategoryId, string> = {
  'world-news': 'z.B. BBC, CNN, New York Times, Le Monde',
  'german-politics': 'z.B. Tagesschau, Die Zeit, Der Spiegel',
  'ukraine-war': 'z.B. BBC, New York Times, Die Zeit, Tagesschau',
  'middle-east-conflict': 'z.B. BBC, New York Times, Die Zeit, Al Jazeera',
  'global-health': 'z.B. WHO, Health Policy Watch, New York Times',
};

function currentBerlinSlot(): { date: string; schedule: string; formattedDate: string } {
  const now = new Date();
  const berlinNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));

  // Reflects env.SEND_HOUR (see .github/workflows/deploy.yml) so the slot
  // shown in the briefing/email always matches the actually configured send
  // time, instead of drifting out of sync when that value is changed (e.g.
  // for a one-off test at a different hour). Defaults to 8 for local runs
  // where SEND_HOUR isn't set.
  const sendHour = Number(process.env.SEND_HOUR ?? '8');
  const schedule = `${String(sendHour).padStart(2, '0')}:00`;

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

/** Thrown by parseModelJson() when no amount of cleanup could turn the
 * model's response into valid JSON. Distinguished from a generic Error so
 * withRetry() can tell "worth retrying with a fresh generation" apart from
 * a genuinely fatal error (e.g. a bad API key). */
class ModelJsonParseError extends Error {}

function isTransientApiError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 503 || status === 429;
}

function isRetryable(err: unknown): boolean {
  return err instanceof ModelJsonParseError || isTransientApiError(err);
}

/** Transient API errors (503 "overloaded", 429 rate limit) get a 5 minute
 * backoff, matching Gemini's typical recovery time. A ModelJsonParseError
 * isn't a server-side problem - it's just an unlucky single generation - so
 * it gets a short 10s pause and then a completely fresh API call, since
 * generation isn't deterministic and a retry has a good chance of producing
 * valid JSON the model failed to on this attempt. */
function retryDelayMs(err: unknown): number {
  return err instanceof ModelJsonParseError ? 10_000 : 300_000;
}

/** Retries retryable failures (see isRetryable) up to `attempts` times
 * total. The workflow starts 15 minutes before env.SEND_HOUR:00
 * (Europe/Berlin), so even the slower transient-error backoff (3 retries a
 * 5 minutes) lands close to when the email is due anyway. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt === attempts;
      if (isLastAttempt || !isRetryable(err)) throw err;
      const delay = retryDelayMs(err);
      const reason = err instanceof ModelJsonParseError ? 'ungültiges JSON' : 'Gemini-API vorübergehend nicht verfügbar';
      console.warn(`${reason} (Versuch ${attempt}/${attempts}), erneuter Versuch in ${delay / 1000}s …`);
      await sleep(delay);
    }
  }
  throw new Error('unreachable');
}

/** JSON.parse fails on raw (unescaped) control characters inside a string
 * literal - insignificant whitespace between tokens is fine, but Gemini
 * occasionally emits a literal newline inside a "brief" value instead of
 * the escaped "\n", which otherwise looks like well-formed JSON right up
 * until JSON.parse rejects it. This walks the text tracking whether we're
 * inside a string (respecting existing escape sequences) and escapes any
 * raw control character it finds there. */
function escapeRawControlCharsInStrings(text: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        result += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        result += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        if (ch === '\n') result += '\\n';
        else if (ch === '\r') result += '\\r';
        else if (ch === '\t') result += '\\t';
        else result += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      result += ch;
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }

  return result;
}

/** Parses the model's JSON response defensively: strips markdown code
 * fences some models wrap JSON in despite responseMimeType/responseSchema,
 * falls back to extracting the outermost {...} block, and additionally
 * tries escaping raw control characters found inside string literals (see
 * escapeRawControlCharsInStrings) on every candidate. On failure, logs the
 * full raw response (not just the few-char snippet JSON.parse's own error
 * gives you) so a bad response is actually debuggable from the Actions log
 * instead of a guessing game. */
function parseModelJson(rawText: string): any {
  const text = rawText.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const baseCandidates = [text, fenced?.[1]?.trim()].filter(Boolean) as string[];

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    baseCandidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  const candidates = baseCandidates.flatMap((c) => [c, escapeRawControlCharsInStrings(c)]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  console.error('Konnte die Modellantwort nicht als JSON parsen. Vollständige Rohantwort:');
  console.error(rawText);
  throw new ModelJsonParseError('Modellantwort war kein valides JSON (siehe Rohantwort oben im Log).');
}

/** Liest die zuletzt committete Ausgabe aus dem bereits ausgecheckten Repo
 * (kein Netzwerk-Fetch nötig, da der Workflow sie nach jedem Lauf zurück
 * committet - siehe .github/workflows/deploy.yml). Gibt null zurück beim
 * allerersten Lauf oder falls die Datei aus irgendeinem Grund fehlt. */
async function loadPreviousEdition(): Promise<NewsBrief | null> {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    return JSON.parse(raw) as NewsBrief;
  } catch {
    return null;
  }
}

function buildPrompt(date: string, schedule: string, previous: NewsBrief | null): string {
  const previousContext = previous
    ? `Vorherige Ausgabe (${previous.formattedDate}, ${previous.schedule} Uhr) zur Einordnung, was bereits
berichtet wurde:
${JSON.stringify(
  {
    executiveSummary: previous.executiveSummary,
    categories: previous.categories?.map((c) => ({ id: c.id, headline: c.headline, brief: c.brief })),
  },
  null,
  2,
)}
Wiederhole diese Inhalte nicht unverändert. Arbeite pro Kategorie heraus, was sich seitdem NEU
entwickelt hat. Falls eine Story weiterläuft, aber es keine wesentliche neue Entwicklung gibt, sage
das kurz und ehrlich (z.B. "keine wesentliche Änderung seit der letzten Ausgabe") statt den alten
Stand erneut ausführlich zu wiederholen.`
    : 'Es gibt noch keine vorherige Ausgabe (erster Lauf) - erstelle das Briefing unabhängig davon.';

  return `
Generiere eine umfassende, hochprofessionelle tägliche Nachrichtenzusammenfassung vollständig in
deutscher Sprache für das Datum ${date}, Update-Slot ${schedule} Uhr (Europe/Berlin).

Nutze Google Search, um aktuelle, echte Nachrichten zu recherchieren. Bevorzuge dabei explizit
diese Quellen, wenn sie zum Thema passende Berichterstattung haben (nutze ihre Original-URLs):
${PREFERRED_SOURCES.map((s) => `- ${s}`).join('\n')}
Andere seriöse Quellen sind erlaubt, falls diese zu einem Thema nichts Passendes berichten.

Wichtig zur Quellenvielfalt: Verteile die Quellen über die fünf Kategorien hinweg möglichst
unterschiedlich. Verlasse dich nicht wiederholt primär auf dieselbe Publikation (insbesondere
nicht auf Al Jazeera für mehrere Kategorien gleichzeitig) - das Ziel ist eine ausgewogene Mischung
über den ganzen Tag, nicht die Dominanz einer einzelnen Quelle.

Du musst genau diese fünf Kategorien abdecken (deutsche Bezeichnung in Klammern, dahinter
naheliegende Beispielquellen für diese Kategorie):
1. world-news (Weltnachrichten): wichtige globale Entwicklungen, Geopolitik, internationale
   Abkommen. ${CATEGORY_SOURCE_HINTS['world-news']}
2. german-politics (Bundespolitik Deutschland): Bundestag, Regierungskoalition, Gesetzesvorhaben.
   ${CATEGORY_SOURCE_HINTS['german-politics']}
3. ukraine-war (Krieg in der Ukraine): militärische Lage, Diplomatie, humanitäre Lage.
   ${CATEGORY_SOURCE_HINTS['ukraine-war']}
4. middle-east-conflict (Nahost-Konflikt): Gaza, Israel, Libanon, regionale Entwicklungen.
   ${CATEGORY_SOURCE_HINTS['middle-east-conflict']}
5. global-health (Globale Gesundheit): Ausbrüche, WHO-Meldungen, Pandemien, Gesundheitspolitik.
   ${CATEGORY_SOURCE_HINTS['global-health']}

Pro Kategorie:
- headline: prägnante, professionelle Schlagzeile auf Deutsch (max. 15 Wörter).
- brief: sachlicher, informativer Bericht auf Deutsch (4-6 Sätze, konkrete Zahlen/Fakten wo vorhanden).
- sources: 1-3 echte Quellen (title = Name des Mediums, url = direkte echte Artikel-URL). Erfinde
  niemals URLs. Wenn du zu einer Kategorie nichts Verlässliches findest, sage das ehrlich in
  "brief" statt eine Nachricht zu erfinden.

executiveSummary: exakt 5 kurze, eigenständige Sätze (kein Markdown, keine Aufzählungszeichen -
das Frontend fügt die Bullet-Punkte selbst hinzu), einer pro Kategorie, in der Reihenfolge
Weltnachrichten, Bundespolitik Deutschland, Krieg in der Ukraine, Nahost-Konflikt, Globale Gesundheit.

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
  const previous = await loadPreviousEdition();

  const ai = new GoogleGenAI({ apiKey });

  // The whole generate-and-parse round trip is retried together (not just
  // the API call): a ModelJsonParseError means this specific generation came
  // back malformed, and since Gemini generation isn't deterministic, a fresh
  // call is the actual fix - re-parsing the same broken text would just fail
  // the same way again.
  const parsed = await withRetry(async () => {
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
                required: ['id', 'name', 'headline', 'brief', 'sources'],
              },
            },
          },
          required: ['executiveSummary', 'categories'],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Leere Antwort von Gemini erhalten.');
    return parseModelJson(text);
  });

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
