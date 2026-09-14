export type Locale = 'de' | 'en';

export const locales: Locale[] = ['de', 'en'];

export function localePath(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === 'de') return clean === '/' ? '/' : clean;
  return clean === '/' ? '/en' : `/en${clean}`;
}

export function localizeHref(locale: Locale, href: string): string {
  if (href.startsWith('http') || href.startsWith('#')) return href;
  return localePath(locale, href);
}

const dict = {
  de: {
    search: 'Tools durchsuchen',
    searchHint: 'Name oder Aufgabe',
    command: 'Befehlspalette',
    categories: 'Werkstatt',
    all: 'Alle',
    drop: 'Dateien hierher ziehen, einfügen oder wählen',
    dropHint: 'Nichts verlässt dieses Gerät.',
    choose: 'Dateien wählen',
    presets: 'Voreinstellungen',
    options: 'Optionen',
    run: 'Ausführen',
    cancel: 'Abbrechen',
    progress: 'Fortschritt',
    results: 'Ergebnisse',
    download: 'Download',
    downloadAll: 'Alles als ZIP',
    errors: 'Fehlerprotokoll',
    report: 'Report',
    empty: 'Noch keine Dateien.',
    pipeline: 'Pipeline',
    reader: 'Reader',
    licenses: 'Lizenzen',
    imprint: 'Impressum',
    privacy: 'Datenschutz',
    theme: 'Darstellung',
    localBadge: 'Lokal · kein Upload · kein Tracking',
    addStep: 'Schritt hinzufügen',
    share: 'Link teilen',
    execute: 'Pipeline ausführen',
    openTitle: 'Datei öffnen',
    suggest: 'Passende Werkzeuge',
    todo: 'TODO',
    verification: 'Verifikation',
    verifyPass: 'bestanden',
    verifyFail: 'fehlgeschlagen',
    redactEditor: 'Schwärzung',
    redactText: 'Text auswählen',
    redactRect: 'Rechteck',
    redactSearch: 'Suchen & markieren',
    redactApply: 'Schwärzen & verifizieren',
    marks: 'Markierungen',
    autoHits: 'Auto-Treffer',
    loadingNer: 'Lade NER-Modell…',
    loadingHits: 'Suche Muster…',
  },
  en: {
    search: 'Search tools',
    searchHint: 'Name or task',
    command: 'Command palette',
    categories: 'Workshop',
    all: 'All',
    drop: 'Drop, paste or choose files',
    dropHint: 'Nothing leaves this device.',
    choose: 'Choose files',
    presets: 'Presets',
    options: 'Options',
    run: 'Run',
    cancel: 'Cancel',
    progress: 'Progress',
    results: 'Results',
    download: 'Download',
    downloadAll: 'Download ZIP',
    errors: 'Error log',
    report: 'Report',
    empty: 'No files yet.',
    pipeline: 'Pipeline',
    reader: 'Reader',
    licenses: 'Licenses',
    imprint: 'Legal notice',
    privacy: 'Privacy',
    theme: 'Theme',
    localBadge: 'Local · no upload · no tracking',
    addStep: 'Add step',
    share: 'Share link',
    execute: 'Run pipeline',
    openTitle: 'Open file',
    suggest: 'Suggested tools',
    todo: 'TODO',
    verification: 'Verification',
    verifyPass: 'passed',
    verifyFail: 'failed',
    redactEditor: 'Redaction',
    redactText: 'Select text',
    redactRect: 'Rectangle',
    redactSearch: 'Find & mark',
    redactApply: 'Redact & verify',
    marks: 'Marks',
    autoHits: 'Auto hits',
    loadingNer: 'Loading NER model…',
    loadingHits: 'Scanning patterns…',
  },
} as const;

export type UiKey = keyof (typeof dict)['de'];

export function t(locale: Locale, key: UiKey): string {
  return dict[locale][key];
}

export const categoryLabels: Record<Locale, Record<string, string>> = {
  de: { pdf: 'PDF', convert: 'Konvertieren', privacy: 'Datenschutz', test: 'Test', forensics: 'Forensik & Privacy' },
  en: { pdf: 'PDF', convert: 'Convert', privacy: 'Privacy', test: 'Test', forensics: 'Forensics & Privacy' },
};
