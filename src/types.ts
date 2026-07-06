export type CategoryId =
  | 'world-news'
  | 'german-politics'
  | 'global-health'
  | 'ukraine-war'
  | 'middle-east-conflict';

export interface NewsSource {
  title: string;
  url: string;
}

export interface NewsCategory {
  id: CategoryId;
  name: string;
  headline: string;
  brief: string;
  whyRelevant: string;
  sources: NewsSource[];
}

export interface NewsBrief {
  id: string;
  timestamp: string;
  formattedDate: string;
  schedule: string;
  executiveSummary: string[];
  categories: NewsCategory[];
  isSimulated?: boolean;
  warning?: string;
}

export const CATEGORY_ORDER: CategoryId[] = [
  'global-health',
  'german-politics',
  'ukraine-war',
  'middle-east-conflict',
  'world-news',
];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  'global-health': 'Globale Gesundheit',
  'german-politics': 'Bundespolitik Deutschland',
  'ukraine-war': 'Krieg in der Ukraine',
  'middle-east-conflict': 'Nahost-Konflikt',
  'world-news': 'Weltnachrichten',
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
};
