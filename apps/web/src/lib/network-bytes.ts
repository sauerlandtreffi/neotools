/** Count bytes transferred to foreign origins. Same-origin asset loads are ignored. */

export function foreignTransferBytes(entries: readonly PerformanceResourceTiming[], origin: string): number {
  let total = 0;
  for (const entry of entries) {
    try {
      const url = new URL(entry.name, origin);
      if (url.origin !== new URL(origin).origin) {
        total += entry.transferSize || entry.encodedBodySize || 0;
      }
    } catch {
      // ignore unparsable names
    }
  }
  return total;
}

/** Short form for the workspace badge: "0 B", "812 B", "1.4 KB". */
export function formatBytesShort(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatByteCount(bytes: number, locale: 'de' | 'en'): string {
  if (bytes <= 0) return locale === 'de' ? '0 Bytes gesendet' : '0 bytes sent';
  if (bytes < 1024) return locale === 'de' ? `${bytes} Bytes gesendet` : `${bytes} bytes sent`;
  return locale === 'de'
    ? `${(bytes / 1024).toFixed(1)} KB an fremde Origins`
    : `${(bytes / 1024).toFixed(1)} KB to foreign origins`;
}
