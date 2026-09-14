import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function newJobId(): string {
  return `job_${randomBytes(16).toString('hex')}`;
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function keyAllowed(presented: string, keys: Set<string>): boolean {
  let ok = false;
  for (const candidate of keys) {
    if (timingSafeEqualString(presented, candidate)) ok = true;
  }
  return ok;
}

/**
 * Error text that may reach a client: no stack frames, no file system paths,
 * no `file://` URLs, no Node error codes with paths, bounded length.
 */
export function publicErrorMessage(raw: unknown, fallback = 'Interner Fehler'): string {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : '';
  if (!text) return fallback;
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  if (/\n\s+at\s/.test(text) || /\/[\w.@-]+\.(?:ts|js|mjs|cjs):\d+/.test(firstLine)) return fallback;
  const scrubbed = firstLine
    .replace(/file:\/\/\S+/g, '[pfad]')
    .replace(/(?:[A-Za-z]:)?(?:\\|\/)(?:[\w.@ -]+(?:\\|\/))+[\w.@ -]*/g, '[pfad]')
    .replace(/\s+/g, ' ')
    .trim();
  return scrubbed.slice(0, 200) || fallback;
}

export function safeDownloadName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'file';
  const cleaned = base.replace(/[^\w.\- ()[\]]+/g, '_').replace(/^\.+/, '').slice(0, 180);
  return cleaned || 'file.bin';
}
