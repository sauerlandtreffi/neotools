/**
 * Redirect map after the app-first pivot (FRONTEND-REDESIGN §11.1/6–7).
 *
 * Single source of truth for
 *   - Astro `redirects` (static HTML with meta refresh + canonical),
 *   - `dist/_redirects` (Netlify/Cloudflare style, real 301s on such hosts),
 *   - `e2e/server.mjs` (serves 301 so Playwright can assert status + target),
 *   - deploy/docker nginx (generated from the same file).
 *
 * `[param]` / `[...rest]` follow Astro's syntax; `_redirects` uses `:param` / `*`.
 */

/** Static, one-to-one. */
export const STATIC_REDIRECTS = {
  // information moved to /info
  '/formats': '/info/formats',
  '/convert': '/info/convert',
  '/guides': '/info/guides',
  '/preise': '/info/preise',
  '/ueber': '/info/ueber',
  '/impressum': '/info/impressum',
  '/datenschutz': '/info/datenschutz',
  '/lizenzen': '/info/lizenzen',
  '/lizenz': '/info/lizenz',
  '/no-upload': '/info/no-upload',
  '/spec': '/info/spec',
  '/vergleich/ilovepdf': '/info/vergleich/ilovepdf',
  '/vergleich/smallpdf': '/info/vergleich/smallpdf',
  '/vergleich/adobe-acrobat': '/info/vergleich/adobe-acrobat',
  '/en/formats': '/en/info/formats',
  '/en/convert': '/en/info/convert',
  '/en/guides': '/en/info/guides',
  '/en/pricing': '/en/info/pricing',
  '/en/about': '/en/info/about',
  '/en/imprint': '/en/info/imprint',
  '/en/privacy': '/en/info/privacy',
  '/en/licenses': '/en/info/licenses',
  '/en/license': '/en/info/license',
  '/en/no-upload': '/en/info/no-upload',
  '/en/spec': '/en/info/spec',
  '/en/compare/ilovepdf': '/en/info/compare/ilovepdf',
  '/en/compare/smallpdf': '/en/info/compare/smallpdf',
  '/en/compare/adobe-acrobat': '/en/info/compare/adobe-acrobat',
  // former app pages → program panels
  '/workspace': '/app',
  '/en/workspace': '/en/app',
  '/reader': '/',
  '/en/reader': '/en',
  '/verlauf': '/?panel=history',
  '/en/history': '/en?panel=history',
  '/pipeline': '/?panel=pipeline',
  '/en/pipeline': '/en?panel=pipeline',
  '/watch': '/?panel=watch',
  '/en/watch': '/en?panel=watch',
};

/** Dynamic (Astro syntax). Each target route has getStaticPaths, so Astro emits one page per path. */
export const DYNAMIC_REDIRECTS = {
  '/formats/[id]': '/info/formats/[id]',
  '/convert/[pair]': '/info/convert/[pair]',
  '/guides/[slug]': '/info/guides/[slug]',
  '/spec/[platform]': '/info/spec/[platform]',
  '/en/formats/[id]': '/en/info/formats/[id]',
  '/en/convert/[pair]': '/en/info/convert/[pair]',
  '/en/guides/[slug]': '/en/info/guides/[slug]',
  '/en/spec/[platform]': '/en/info/spec/[platform]',
};

/** Astro config value. */
export const astroRedirects = Object.fromEntries(
  Object.entries({ ...STATIC_REDIRECTS, ...DYNAMIC_REDIRECTS }).map(([from, to]) => [from, { status: 301, destination: to }]),
);

/** `_redirects` text (Netlify/Cloudflare Pages). */
export function redirectsFile() {
  const lines = ['# generated from apps/web/redirects.mjs — do not edit'];
  for (const [from, to] of Object.entries(STATIC_REDIRECTS)) lines.push(`${from}  ${to}  301`);
  for (const [from, to] of Object.entries(DYNAMIC_REDIRECTS)) {
    lines.push(`${from.replace(/\[\.\.\.(\w+)\]/g, '*').replace(/\[(\w+)\]/g, ':$1')}  ${to.replace(/\[\.\.\.(\w+)\]/g, ':splat').replace(/\[(\w+)\]/g, ':$1')}  301`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Resolve a request path against the map (used by the e2e server and nginx generator tests).
 * Returns the destination or null.
 */
export function resolveRedirect(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (clean in STATIC_REDIRECTS) return STATIC_REDIRECTS[clean];
  const segs = clean.split('/');
  for (const [from, to] of Object.entries(DYNAMIC_REDIRECTS)) {
    const pat = from.split('/');
    const params = {};
    let ok = true;
    for (let i = 0; i < pat.length && ok; i++) {
      const p = pat[i];
      const rest = /^\[\.\.\.(\w+)\]$/.exec(p);
      const one = /^\[(\w+)\]$/.exec(p);
      if (rest) {
        params[rest[1]] = segs.slice(i).join('/');
        if (!params[rest[1]]) ok = false;
        break;
      } else if (one) {
        if (!segs[i]) ok = false;
        else params[one[1]] = segs[i];
      } else if (p !== segs[i]) ok = false;
    }
    if (!ok || (!from.includes('[...') && pat.length !== segs.length)) continue;
    return to.replace(/\[\.\.\.(\w+)\]|\[(\w+)\]/g, (_, r, o) => params[r ?? o] ?? '');
  }
  return null;
}
