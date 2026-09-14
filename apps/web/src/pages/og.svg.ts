import type { APIRoute } from 'astro';
import { branding } from '../lib/branding';

export const GET: APIRoute = ({ url }) => {
  const name = url.searchParams.get('n') || branding.name;
  const accent = branding.colors.accent;
  const primary = branding.colors.primary;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${primary}"/>
  <rect x="48" y="48" width="1104" height="534" fill="none" stroke="${accent}" stroke-width="4"/>
  <text x="80" y="280" fill="${branding.colors.ink}" font-size="72" font-family="Georgia, serif">${escapeXml(name)}</text>
  <text x="80" y="360" fill="${accent}" font-size="28" font-family="ui-monospace, monospace">lokal · kein Upload · kein Tracking</text>
</svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } });
};

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (ch) => {
    if (ch === '<') return '&lt;';
    if (ch === '>') return '&gt;';
    if (ch === '&') return '&amp;';
    if (ch === "'") return '&apos;';
    return '&quot;';
  });
}
