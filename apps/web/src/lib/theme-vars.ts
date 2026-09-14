import { ensureContrast } from './contrast';
import type { Branding } from './branding';

const PAPER = '#f3efe4';
const DEFAULT_ACCENT_LIGHT = '#1f8f74';
const DEFAULT_ACCENT_DARK = '#3ee0b4';

/**
 * Inline CSS variables for `<html>`: brand colours plus contrast-checked
 * accents for both schemes (FRONTEND-REDESIGN §4.8 — fall back to default mint
 * when the white-label colour is not readable).
 */
export function brandCssVars(branding: Branding): string {
  const { primary, accent, ink, accentLight } = branding.colors;
  const dark = ensureContrast(accent, primary, DEFAULT_ACCENT_DARK, 3);
  const light = ensureContrast(accentLight ?? accent, PAPER, DEFAULT_ACCENT_LIGHT, 3);
  const vars = [
    `--brand-primary:${primary}`,
    `--brand-accent:${accent}`,
    `--brand-ink:${ink}`,
    `--brand-accent-dark:${dark}`,
    `--brand-accent-light:${light}`,
  ];
  if (branding.fonts?.ui) vars.push(`--font-ui-brand:'${branding.fonts.ui}'`);
  if (branding.fonts?.display) vars.push(`--font-display-brand:'${branding.fonts.display}'`);
  return vars.join(';');
}

/** `@font-face` rules for white-label fonts shipped under /assets (never remote). */
export function brandFontFaces(branding: Branding): string {
  const files = branding.fonts?.files ?? [];
  return files
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-style:${f.style ?? 'normal'};font-weight:${f.weight ?? 400};font-display:swap;src:url('${f.src}')}`,
    )
    .join('');
}

/** Inline script: applies the stored theme (or system preference) before first paint. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('neotools-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);if(!t){matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(e){if(!localStorage.getItem('neotools-theme'))document.documentElement.classList.toggle('dark',e.matches);});}}catch(e){}})();`;
