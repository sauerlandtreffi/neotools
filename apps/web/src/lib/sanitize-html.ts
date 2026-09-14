import DOMPurify from 'dompurify';

type PurifyLike = { sanitize: (dirty: string, cfg?: Record<string, unknown>) => string };

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
  return purify
    ? purify.sanitize(raw, {
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'style', 'base', 'svg', 'math', 'template'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style', 'srcdoc', 'formaction', 'target'],
        ALLOW_DATA_ATTR: false,
        ALLOW_UNKNOWN_PROTOCOLS: false,
      })
    : '';
}
