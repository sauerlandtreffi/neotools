import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BrandingColors {
  primary: string;
  accent: string;
  ink: string;
  /** Accent used as fill/text on the light (paper) surface; derived from `accent` when omitted. */
  accentLight?: string;
}

/** White-label font file — only same-origin paths under /assets are accepted. */
export interface BrandingFontFile {
  family: string;
  src: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

export interface BrandingFonts {
  /** UI sans family name (workspace chrome). */
  ui?: string;
  /** Display serif family name (marketing headlines). */
  display?: string;
  files?: BrandingFontFile[];
}

export interface BrandingFooterLink {
  href: string;
  label: { de: string; en: string };
}

export interface BrandingLegal {
  operator: string;
  address: string;
  email: string;
  phone: string;
  vatId: string;
  register: string;
  responsible: string;
  updated: string;
}

export interface BrandingPlanPrice {
  yearly: string;
  monthly: string;
}

export interface BrandingPricing {
  pro: BrandingPlanPrice;
  enterprise: BrandingPlanPrice;
}

export interface BrandingContact {
  email: string;
  github: string;
}

export interface BrandingHosting {
  provider: string;
  region: string;
}

export interface BrandingDesktop {
  updateCheck: boolean;
  releasesUrl: string;
}

export interface Branding {
  name: string;
  tagline: { de: string; en: string };
  logo: string;
  colors: BrandingColors;
  fonts?: BrandingFonts;
  impressum: string;
  privacy: string;
  hiddenTools: string[];
  defaultLocale: 'de' | 'en';
  footerLinks: BrandingFooterLink[];
  /** Embedded license token (Docker: NEOTOOLS_LICENSE). */
  license?: string;
  licensePubkey?: string;
  presetsPath?: string;
  showPoweredBy?: boolean;
  legal: BrandingLegal;
  pricing: BrandingPricing;
  contact: BrandingContact;
  hosting: BrandingHosting;
  desktop: BrandingDesktop;
}

const ON_REQUEST = 'auf Anfrage';

const FALLBACK_LEGAL: BrandingLegal = {
  operator: '',
  address: '',
  email: '',
  phone: '',
  vatId: '',
  register: '',
  responsible: '',
  updated: '2026-09-14',
};

const FALLBACK_PLAN: BrandingPlanPrice = { yearly: ON_REQUEST, monthly: ON_REQUEST };

const FALLBACK: Branding = {
  name: 'NeoTools',
  tagline: {
    de: 'Werkzeuge, die den Rechner nicht verlassen.',
    en: 'Tools that never leave your machine.',
  },
  logo: '/logo.svg',
  colors: { primary: '#10221c', accent: '#3ee0b4', ink: '#e8efe9' },
  impressum: 'TODO: Impressumsangaben über legal.* in branding.json setzen.',
  privacy: 'TODO: Datenschutz über legal.*, hosting.* und desktop.* in branding.json setzen.',
  hiddenTools: [],
  defaultLocale: 'de',
  footerLinks: [],
  license: '',
  licensePubkey: '',
  presetsPath: '',
  showPoweredBy: true,
  legal: FALLBACK_LEGAL,
  pricing: { pro: { ...FALLBACK_PLAN }, enterprise: { ...FALLBACK_PLAN } },
  contact: { email: '', github: 'https://github.com/neotools/neotools' },
  hosting: { provider: '', region: '' },
  desktop: {
    updateCheck: true,
    releasesUrl: 'https://github.com/neotools/neotools/releases?q=desktop-v',
  },
};

function mergePlan(parsed: Partial<BrandingPlanPrice> | undefined): BrandingPlanPrice {
  const yearly = parsed?.yearly?.trim() || ON_REQUEST;
  const monthly = parsed?.monthly?.trim() || ON_REQUEST;
  return { yearly, monthly };
}

function normalize(
  parsed: Partial<Branding> & {
    colors?: Partial<BrandingColors>;
    fonts?: BrandingFonts;
    legal?: Partial<BrandingLegal>;
    pricing?: { pro?: Partial<BrandingPlanPrice>; enterprise?: Partial<BrandingPlanPrice> };
    contact?: Partial<BrandingContact>;
    hosting?: Partial<BrandingHosting>;
    desktop?: Partial<BrandingDesktop>;
  },
): Branding {
  const legal = { ...FALLBACK_LEGAL, ...parsed.legal };
  const contact = { ...FALLBACK.contact, ...parsed.contact };
  if (!contact.email.trim() && legal.email.trim()) contact.email = legal.email;
  return {
    ...FALLBACK,
    ...parsed,
    colors: {
      primary: safeCssColor(parsed.colors?.primary ?? FALLBACK.colors.primary, FALLBACK.colors.primary),
      accent: safeCssColor(parsed.colors?.accent ?? FALLBACK.colors.accent, FALLBACK.colors.accent),
      ink: safeCssColor(parsed.colors?.ink ?? FALLBACK.colors.ink, FALLBACK.colors.ink),
      ...(parsed.colors?.accentLight
        ? { accentLight: safeCssColor(parsed.colors.accentLight, '#1f8f74') }
        : {}),
    },
    fonts: safeFonts(parsed.fonts),
    logo: safeAssetUrl(parsed.logo ?? FALLBACK.logo, FALLBACK.logo),
    hiddenTools: parsed.hiddenTools ?? FALLBACK.hiddenTools,
    defaultLocale: parsed.defaultLocale === 'en' ? 'en' : 'de',
    footerLinks: parsed.footerLinks ?? FALLBACK.footerLinks,
    license: process.env.NEOTOOLS_LICENSE || parsed.license || FALLBACK.license,
    licensePubkey:
      process.env.NEOTOOLS_LICENSE_PUBKEY ||
      parsed.licensePubkey ||
      loadPubkeyFile() ||
      FALLBACK.licensePubkey,
    presetsPath: process.env.NEOTOOLS_PRESETS || parsed.presetsPath || FALLBACK.presetsPath,
    showPoweredBy: parsed.showPoweredBy ?? FALLBACK.showPoweredBy,
    legal,
    pricing: {
      pro: mergePlan(parsed.pricing?.pro),
      enterprise: mergePlan(parsed.pricing?.enterprise),
    },
    contact,
    hosting: { ...FALLBACK.hosting, ...parsed.hosting },
    desktop: {
      updateCheck: parsed.desktop?.updateCheck ?? FALLBACK.desktop.updateCheck,
      releasesUrl: parsed.desktop?.releasesUrl?.trim() || FALLBACK.desktop.releasesUrl,
    },
  };
}

function loadPubkeyFile(): string {
  const candidates = [
    resolve(process.cwd(), '../../license-pubkey.json'),
    resolve(process.cwd(), 'license-pubkey.json'),
    resolve(process.cwd(), 'public/license-pubkey.json'),
  ];
  for (const file of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
        publicKeyHex?: string;
        publicKey?: string;
      };
      return parsed.publicKeyHex || parsed.publicKey || '';
    } catch {
      // next
    }
  }
  return '';
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

/** Empty branding fields stay visible as template slots (no invented legal data). */
export function brandingSlot(value: string | undefined, slot: string): string {
  const trimmed = value?.trim() ?? '';
  return trimmed || slot;
}

export function brandingContactEmail(branding: Branding = loadBranding()): string {
  return branding.contact.email.trim() || branding.legal.email.trim();
}

export function brandingPrice(value: string | undefined, locale: 'de' | 'en'): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === ON_REQUEST) return locale === 'de' ? 'auf Anfrage' : 'on request';
  return trimmed;
}

export const branding = loadBranding();

const FONT_FAMILY_RE = /^[\w .'-]{1,60}$/;

/** Only locally shipped font files (no remote URLs, no data: URIs). */
export function safeFonts(fonts: BrandingFonts | undefined): BrandingFonts | undefined {
  if (!fonts || typeof fonts !== 'object') return undefined;
  const out: BrandingFonts = {};
  if (typeof fonts.ui === 'string' && FONT_FAMILY_RE.test(fonts.ui)) out.ui = fonts.ui;
  if (typeof fonts.display === 'string' && FONT_FAMILY_RE.test(fonts.display)) out.display = fonts.display;
  const files = (fonts.files ?? []).filter(
    (f): f is BrandingFontFile =>
      Boolean(f) &&
      typeof f.family === 'string' &&
      FONT_FAMILY_RE.test(f.family) &&
      typeof f.src === 'string' &&
      /^\/assets\/[\w./-]+\.(woff2?|ttf|otf)$/.test(f.src) &&
      !f.src.includes('..'),
  );
  if (files.length) out.files = files.map((f) => ({
    family: f.family,
    src: f.src,
    weight: typeof f.weight === 'number' && f.weight >= 100 && f.weight <= 900 ? f.weight : 400,
    style: f.style === 'italic' ? 'italic' : 'normal',
  }));
  return Object.keys(out).length ? out : undefined;
}

export function safeCssColor(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)$/.test(v)) return v;
  return fallback;
}

export function safeAssetUrl(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  if (v.startsWith('/') && !v.startsWith('//') && !v.includes('\\')) return v;
  return fallback;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
