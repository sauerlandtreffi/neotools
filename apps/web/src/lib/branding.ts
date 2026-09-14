import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Branding {
  name: string;
  tagline: { de: string; en: string };
  logo: string;
  colors: { primary: string; accent: string; ink: string };
  impressum: string;
  privacy: string;
}

const FALLBACK: Branding = {
  name: 'NeoTools',
  tagline: {
    de: 'Werkzeuge, die den Rechner nicht verlassen.',
    en: 'Tools that never leave your machine.',
  },
  logo: '/logo.svg',
  colors: { primary: '#10221c', accent: '#3ee0b4', ink: '#e8efe9' },
  impressum: 'TODO: Impressumsangaben ergänzen (Name, Anschrift, Kontakt).',
  privacy:
    'TODO: Datenschutztext ergänzen. Verarbeitung erfolgt lokal im Browser; es gibt kein Tracking.',
};

export function loadBranding(): Branding {
  const fromEnv = process.env.NEOTOOLS_BRANDING;
  const candidates = [
    fromEnv,
    resolve(process.cwd(), '../../branding.json'),
    resolve(process.cwd(), 'branding.json'),
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Branding;
      return { ...FALLBACK, ...parsed, colors: { ...FALLBACK.colors, ...parsed.colors } };
    } catch {
      // try next
    }
  }
  return FALLBACK;
}

export const branding = loadBranding();
