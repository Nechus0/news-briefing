import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ExternalLink, RefreshCw, Clock, WifiOff, CalendarDays, Droplets } from 'lucide-react';
import { NewsBrief } from './types';
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_COLORS } from './types';
import { demoBrief } from './mockData';

const CACHE_KEY = 'daily-news-briefing:last-success';
const DATA_URL = `${import.meta.env.BASE_URL}data/latest.json`;

type LoadState = 'loading' | 'live' | 'cached' | 'demo';

function loadCached(): NewsBrief | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as NewsBrief) : null;
  } catch {
    return null;
  }
}

function saveCached(brief: NewsBrief) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(brief));
  } catch {
    // ignore quota / privacy-mode errors – caching is a nice-to-have only
  }
}

export default function App() {
  const [brief, setBrief] = useState<NewsBrief | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NewsBrief;
      setBrief(data);
      setState('live');
      saveCached(data);
    } catch (err) {
      console.warn('Konnte data/latest.json nicht laden, weiche aus:', err);
      const cached = loadCached();
      if (cached) {
        setBrief(cached);
        setState('cached');
      } else {
        setBrief(demoBrief);
        setState('demo');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!brief) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400">
        Lade Briefing …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0b10] pb-16">
      <div className="max-w-2xl mx-auto px-4 pt-10 sm:pt-14">
        <header className="mb-6">
          <p className="text-xs font-semibold tracking-widest text-violet-400 uppercase mb-2">
            Daily News Briefing
          </p>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Dein tägliches Update
            </h1>
            <button
              onClick={load}
              disabled={refreshing}
              aria-label="Aktualisieren"
              className="shrink-0 mt-1 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition disabled:opacity-50"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin text-zinc-300' : 'text-zinc-300'} />
            </button>
          </div>
          <p className="text-sm text-zinc-400 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{brief.formattedDate}</span>
            {brief.schedule && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} /> {brief.schedule} Uhr
                </span>
              </>
            )}
          </p>

          {state === 'demo' && (
            <div className="mt-3 text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Noch keine echten Daten verfügbar – dies ist ein Beispiel-Briefing. Sobald der
              GitHub-Actions-Workflow einmal gelaufen ist, erscheint hier das echte Update.
            </div>
          )}
          {state === 'cached' && (
            <div className="mt-3 text-xs text-zinc-400 bg-white/5 border border-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
              <WifiOff size={13} /> Konnte kein frisches Update laden – zeige die zuletzt
              gespeicherte Ausgabe.
            </div>
          )}
        </header>

        {(brief.weather || brief.calendar) && (
          <div className="grid sm:grid-cols-2 gap-3 mb-6">
            {brief.weather && (
              <a
                href={brief.weather.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-[#15151d] border border-white/10 p-4 flex items-center gap-3 hover:bg-[#1b1b25] transition"
              >
                <span className="text-3xl leading-none">{brief.weather.icon}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold tracking-wide uppercase text-zinc-500 mb-0.5">
                    Wetter · Berlin
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {brief.weather.tempMinC}° – {brief.weather.tempMaxC}°C · {brief.weather.description}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                    <Droplets size={12} /> {brief.weather.precipitationProbability}% Regenwahrscheinlichkeit
                  </p>
                </div>
              </a>
            )}
            {brief.calendar && (
              <div className="rounded-2xl bg-[#15151d] border border-white/10 p-4">
                <p className="text-[11px] font-semibold tracking-wide uppercase text-zinc-500 mb-2 flex items-center gap-1.5">
                  <CalendarDays size={13} /> Termine heute
                </p>
                {brief.calendar.length === 0 ? (
                  <p className="text-sm text-zinc-400">Keine Termine heute 🎉</p>
                ) : (
                  <ul className="space-y-1.5">
                    {brief.calendar.map((e, i) => (
                      <li key={i} className="text-sm text-zinc-200 flex gap-2">
                        <span className="font-semibold text-zinc-400 shrink-0">{e.time}</span>
                        <span className="truncate">
                          {e.title}
                          {e.location && <span className="text-zinc-500"> · {e.location}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl bg-[#15151d] border border-white/10 p-5 sm:p-6 mb-6 shadow-lg shadow-black/20"
        >
          <p className="text-xs font-semibold tracking-widest text-zinc-400 uppercase mb-3">
            Summary
          </p>
          <ul className="space-y-2.5">
            {brief.executiveSummary.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] leading-snug text-zinc-100">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </motion.section>

        <div className="space-y-5">
          {CATEGORY_ORDER.map((catId, idx) => {
            const cat = brief.categories.find((c) => c.id === catId);
            if (!cat) return null;
            const colors = CATEGORY_COLORS[catId];
            return (
              <motion.article
                key={catId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 * idx }}
                className={`rounded-2xl bg-[#15151d] border border-white/10 border-l-[3px] ${colors.bar} p-5 sm:p-6 shadow-lg shadow-black/10`}
              >
                <span
                  className={`inline-block text-[11px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-full ${colors.chip} mb-3`}
                >
                  {catId === 'feel-good-news' ? '✨ ' : ''}
                  {cat.name || CATEGORY_LABELS[catId]}
                </span>
                <h2 className="text-lg sm:text-xl font-semibold text-white leading-snug mb-2">
                  {cat.headline}
                </h2>
                <p className="text-[15px] leading-relaxed text-zinc-300 mb-3">{cat.brief}</p>

                {cat.whyRelevant && (
                  <div className="rounded-xl bg-white/5 px-3.5 py-3 mb-4">
                    <span className="font-semibold text-zinc-200">Warum relevant: </span>
                    <span className="text-zinc-400">{cat.whyRelevant}</span>
                  </div>
                )}

                {cat.sources?.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[11px] font-semibold tracking-wide uppercase text-zinc-500 mb-2">
                      Quellen
                    </p>
                    <ul className="space-y-1.5">
                      {cat.sources.map((s, i) => (
                        <li key={i}>
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-violet-300 hover:text-violet-200 hover:underline underline-offset-2"
                          >
                            <ExternalLink size={12} className="shrink-0" />
                            <span>{s.title}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.article>
            );
          })}
        </div>

        <footer className="mt-10 text-center text-xs text-zinc-500">
          <p>Wird automatisch um 08:00, 14:00 und 20:00 Uhr (Europe/Berlin) aktualisiert.</p>
          <p className="mt-1">
            Generiert von Gemini · zuletzt aktualisiert:{' '}
            {new Date(brief.timestamp).toLocaleString('de-DE', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </footer>
      </div>
    </div>
  );
}
