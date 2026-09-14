export const REDACT_PATTERN_IDS = [
  'iban',
  'steuer-id',
  'sv-nummer',
  'ausweisnummer',
  'kennzeichen',
  'email',
  'telefon',
  'datum',
  'betrag',
  'custom',
  'ner',
  'region',
] as const;

export type RedactPatternId = (typeof REDACT_PATTERN_IDS)[number];

export type RedactMode = 'auto' | 'manual' | 'both';

export interface RedactRegion {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RedactHit {
  page: number;
  pattern: RedactPatternId;
  text: string;
  masked: string;
  x: number;
  y: number;
  w: number;
  h: number;
  selected?: boolean;
}

export interface TextItemBox {
  page: number;
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  end: number;
}

export interface PageTextMap {
  page: number;
  text: string;
  compact: string;
  compactToOffset: number[];
  items: TextItemBox[];
}

export interface RedactFileReport {
  file: string;
  hits: Array<{
    pattern: RedactPatternId;
    page: number;
    count: number;
    masked: string;
  }>;
  rasterizedPages: number[];
  warnings: string[];
}

export interface PreviewRedactResult {
  hits: RedactHit[];
  warnings: string[];
  pages: number;
}
