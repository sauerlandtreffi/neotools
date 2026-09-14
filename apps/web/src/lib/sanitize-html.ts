import DOMPurify from 'dompurify';

type PurifyLike = { sanitize: (dirty: string) => string };

function resolvePurify(): PurifyLike | undefined {
  const mod = DOMPurify as unknown as PurifyLike & { default?: PurifyLike };
  if (typeof mod.sanitize === 'function') return mod;
  if (mod.default && typeof mod.default.sanitize === 'function') return mod.default;
  return undefined;
}

/** SSR-safe: DOMPurify needs a window; islands hydrate the real preview in the browser. */
export function sanitizeHtml(raw: string): string {
  if (typeof window === 'undefined') return '';
  const purify = resolvePurify();
  return purify ? purify.sanitize(raw) : '';
}
