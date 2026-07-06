import { NewsBrief } from './types';

/**
 * Demo-/Fallback-Briefing. Wird angezeigt, solange noch kein
 * data/latest.json vom GitHub-Actions-Workflow erzeugt wurde (z.B. direkt
 * nach dem ersten Deploy) oder falls das Laden der echten Daten fehlschlägt.
 * Inhaltlich ein Beispiel, keine echten aktuellen Nachrichten.
 */
export const demoBrief: NewsBrief = {
  id: 'demo',
  timestamp: new Date().toISOString(),
  formattedDate: 'Beispiel-Ausgabe',
  schedule: '08:00',
  isSimulated: true,
  executiveSummary: [
    'Ebola-Ausbruch in der DR Kongo weitet sich aus: über 1.400 bestätigte Fälle, WHO beschleunigt Diagnostik und Behandlungsstudien.',
    'Koalition in Berlin einigt sich nach Marathonverhandlung auf ein größeres Steuer- und Rentenpaket.',
    'Russland setzt Luftangriffe fort, ukrainische Drohnen treffen weiter russische Raffineriekapazität.',
    'In Gaza hält die Waffenruhe, Israel besteht aber auf dauerhafter Militärpräsenz in Sicherheitszonen.',
    'Erdbebenfolgen und Waldbrände binden international erhebliche Katastrophenhilfe-Kapazitäten.',
  ],
  categories: [
    {
      id: 'global-health',
      name: 'Globale Gesundheit',
      headline: 'Ebola-Ausbruch in der DR Kongo spitzt sich zu (Beispiel)',
      brief: 'Dies ist ein Platzhalter-Text. Sobald der GitHub-Actions-Workflow einmal gelaufen ist, ersetzt eine echte, aktuelle Zusammenfassung diesen Beispieltext.',
      whyRelevant: 'Platzhalter – wird durch echte Einordnung ersetzt.',
      sources: [{ title: 'WHO', url: 'https://www.who.int/' }],
    },
    {
      id: 'german-politics',
      name: 'Bundespolitik Deutschland',
      headline: 'Beispiel-Schlagzeile zur deutschen Bundespolitik',
      brief: 'Platzhaltertext – wird nach dem ersten automatischen Update durch eine echte Zusammenfassung ersetzt.',
      whyRelevant: 'Platzhalter – wird durch echte Einordnung ersetzt.',
      sources: [{ title: 'Tagesschau', url: 'https://www.tagesschau.de/' }],
    },
    {
      id: 'ukraine-war',
      name: 'Krieg in der Ukraine',
      headline: 'Beispiel-Schlagzeile zum Krieg in der Ukraine',
      brief: 'Platzhaltertext – wird nach dem ersten automatischen Update durch eine echte Zusammenfassung ersetzt.',
      whyRelevant: 'Platzhalter – wird durch echte Einordnung ersetzt.',
      sources: [{ title: 'BBC', url: 'https://www.bbc.com/news' }],
    },
    {
      id: 'middle-east-conflict',
      name: 'Nahost-Konflikt',
      headline: 'Beispiel-Schlagzeile zum Nahost-Konflikt',
      brief: 'Platzhaltertext – wird nach dem ersten automatischen Update durch eine echte Zusammenfassung ersetzt.',
      whyRelevant: 'Platzhalter – wird durch echte Einordnung ersetzt.',
      sources: [{ title: 'Al Jazeera', url: 'https://www.aljazeera.com/' }],
    },
    {
      id: 'world-news',
      name: 'Weltnachrichten',
      headline: 'Beispiel-Schlagzeile aus dem Weltgeschehen',
      brief: 'Platzhaltertext – wird nach dem ersten automatischen Update durch eine echte Zusammenfassung ersetzt.',
      whyRelevant: 'Platzhalter – wird durch echte Einordnung ersetzt.',
      sources: [{ title: 'CNN', url: 'https://edition.cnn.com/' }],
    },
  ],
};
