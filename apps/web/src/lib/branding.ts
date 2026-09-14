import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BrandingColors {
  primary: string;
  accent: string;
  ink: string;
}

export interface BrandingFooterLink {
  href: string;
  label: { de: string; en: string };
}

export interface Branding {
  name: string;
  tagline: { de: string; en: string };
  logo: string;
  colors: BrandingColors;
  impressum: string;
  privacy: string;
  hiddenTools: string[];
  defaultLocale: 'de' | 'en';
  footerLinks: BrandingFooterLink[];
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
  hiddenTools: [],
  defaultLocale: 'de',
  footerLinks: [],
};

function normalize(parsed: Partial<Branding> & { colors?: Partial<BrandingColors> }): Branding {
  return {
    ...FALLBACK,
    ...parsed,
    colors: { ...FALLBACK.colors, ...parsed.colors },
    hiddenTools: parsed.hiddenTools ?? FALLBACK.hiddenTools,
    defaultLocale: parsed.defaultLocale === 'en' ? 'en' : 'de',
    footerLinks: parsed.footerLinks ?? FALLBACK.footerLinks,
  };
}

export function loadBranding(filePath?: string): Branding {
  const fromEnv = process.env.NEOTOOLS_BRANDING;
  const candidates = [
    filePath,
    fromEnv,
    resolve(process.cwd(), '../../branding.json'),
    resolve(process.cwd(), 'branding.json'),
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Branding>;
      return normalize(parsed);
    } catch {
      // try next
    }
  }
  return FALLBACK;
}

export function isHiddenTool(id: string, branding: Branding = loadBranding()): boolean {
  return branding.hiddenTools.includes(id);
}

export const branding = loadBranding();
