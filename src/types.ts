export type CategoryId =
  | 'world-news'
  | 'german-politics'
  | 'global-health'
  | 'ukraine-war'
  | 'middle-east-conflict'
  | 'feel-good-news';

export interface NewsSource {
  title: string;
  url: string;
}

export interface NewsCategory {
  id: CategoryId;
  name: string;
  headline: string;
  brief: string;
  whyRelevant?: string;
  sources: NewsSource[];
}

/** A single Google Calendar event happening today (Europe/Berlin). */
export interface CalendarEvent {
  title: string;
  /** e.g. "09:30" or "ganztägig" for all-day events. */
  time: string;
  allDay: boolean;
  location?: string;
}

/** Today's Berlin weather, fetched from Open-Meteo (no API key required). */
export interface WeatherInfo {
  tempMinC: number;
  tempMaxC: number;
  /** 0-100, max daily precipitation probability. */
  precipitationProbability: number;
  /** WMO weather code, see https://open-meteo.com/en/docs#weathervariables */
  weatherCode: number;
  /** Short German description derived from weatherCode, e.g. "Leichter Regen". */
  description: string;
  /** Emoji matching weatherCode, used as the inline icon in the email. */
  icon: string;
  /** Where the weather card links out to when clicked. */
  sourceUrl: string;
}

export interface NewsBrief {
  id: string;
  timestamp: string;
  formattedDate: string;
  schedule: string;
  executiveSummary: string[];
  categories: NewsCategory[];
  /** Today's Google Calendar agenda, empty array if none / calendar not configured. */
  calendar?: CalendarEvent[];
  /** Today's Berlin weather, absent if the weather fetch failed or isn't configured. */
  weather?: WeatherInfo;
  isSimulated?: boolean;
  warning?: string;
}

export const CATEGORY_ORDER: CategoryId[] = [
  'world-news',
  'german-politics',
  'ukraine-war',
  'middle-east-conflict',
  'global-health',
  'feel-good-news',
];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  'global-health': 'Globale Gesundheit',
  'german-politics': 'Bundespolitik Deutschland',
  'ukraine-war': 'Krieg in der Ukraine',
  'middle-east-conflict': 'Nahost-Konflikt',
  'world-news': 'Weltnachrichten',
  'feel-good-news': 'Gute Nachricht des Tages',
};

export const CATEGORY_COLORS: Record<CategoryId, { bar: string; chip: string; dot: string }> = {
  'global-health': {
    bar: 'border-l-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-500',
  },
  'german-politics': {
    bar: 'border-l-blue-500',
    chip: 'bg-blue-500/15 text-blue-400',
    dot: 'bg-blue-500',
  },
  'ukraine-war': {
    bar: 'border-l-red-500',
    chip: 'bg-red-500/15 text-red-400',
    dot: 'bg-red-500',
  },
  'middle-east-conflict': {
    bar: 'border-l-orange-500',
    chip: 'bg-orange-500/15 text-orange-400',
    dot: 'bg-orange-500',
  },
  'world-news': {
    bar: 'border-l-violet-500',
    chip: 'bg-violet-500/15 text-violet-400',
    dot: 'bg-violet-500',
  },
  'feel-good-news': {
    bar: 'border-l-amber-500',
    chip: 'bg-amber-500/15 text-amber-400',
    dot: 'bg-amber-500',
  },
};
