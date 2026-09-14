/** Content-layer IDs drop the dot in `name.de.md` → `namede`. */
export function guideSlugFromId(id: string, locale: 'de' | 'en' = 'de'): string {
  const base = (id.split('/').pop() ?? id).replace(/\.mdx?$/i, '');
  const loc = locale.toLowerCase();
  if (base.toLowerCase().endsWith(`.${loc}`)) return base.slice(0, -(loc.length + 1));
  if (base.toLowerCase().endsWith(loc)) return base.slice(0, -loc.length);
  return base;
}
