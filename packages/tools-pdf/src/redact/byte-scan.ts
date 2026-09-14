const LATIN1 = new TextDecoder('latin1');

const STREAM_RE = /stream\r?\n[\s\S]*?endstream/g;

/** Drop stream bodies so keyword / leftover scans stay outside compressed content. */
export function pdfBytesOutsideStreams(bytes: Uint8Array): string {
  return LATIN1.decode(bytes).replace(STREAM_RE, 'stream\nendstream');
}

export function findNeedlesInPdfBytes(bytes: Uint8Array, needles: string[]): string[] {
  const raw = LATIN1.decode(bytes);
  const outside = pdfBytesOutsideStreams(bytes);
  const hits: string[] = [];
  for (const n of needles) {
    const trimmed = n.trim();
    if (trimmed.length < 4) continue;
    if (raw.includes(trimmed) || outside.includes(trimmed)) hits.push(trimmed);
    const compact = trimmed.replace(/\s+/g, '');
    if (compact.length >= 8 && raw.replace(/\s+/g, '').includes(compact)) {
      if (!hits.includes(trimmed)) hits.push(trimmed);
    }
  }
  return hits;
}

export const SANITIZE_KEYWORDS = [
  '/JavaScript',
  '/JS',
  '/Launch',
  '/EmbeddedFile',
  '/EmbeddedFiles',
  '/FileAttachment',
  '/AA',
  '/OpenAction',
  '/RichMedia',
  '/3D',
  '/Movie',
  '/Sound',
  '/Screen',
  '/XFA',
  '/SubmitForm',
  '/ImportData',
  '/GoToR',
  '/URI',
  '/Encrypt',
] as const;

/** PDF name tokens end at whitespace or a delimiter; `/AA` must not match `/AAPL`, `/JS` not `/JSON`. */
function hasNameToken(haystack: string, name: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(name, from);
    if (at < 0) return false;
    const next = haystack.charAt(at + name.length);
    if (next === '' || /[\s()<>[\]{}/%]/.test(next)) return true;
    from = at + name.length;
  }
}

export function findSanitizeKeywordsOutsideStreams(bytes: Uint8Array): string[] {
  const outside = pdfBytesOutsideStreams(bytes);
  return SANITIZE_KEYWORDS.filter((k) => hasNameToken(outside, k));
}
