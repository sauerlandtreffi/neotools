import { describe, expect, it } from 'vitest';
import { foreignTransferBytes, formatByteCount } from '../src/lib/network-bytes';

describe('network byte tally', () => {
  it('ignores same-origin asset loads', () => {
    const origin = 'https://neotools.local';
    const bytes = foreignTransferBytes(
      [
        { name: 'https://neotools.local/assets/qpdf/qpdf.wasm', transferSize: 1200, encodedBodySize: 1200 } as PerformanceResourceTiming,
        { name: 'https://cdn.example/track.js', transferSize: 80, encodedBodySize: 80 } as PerformanceResourceTiming,
      ],
      origin,
    );
    expect(bytes).toBe(80);
  });

  it('formats the zero-upload badge', () => {
    expect(formatByteCount(0, 'de')).toBe('0 Bytes gesendet');
    expect(formatByteCount(0, 'en')).toBe('0 bytes sent');
  });
});
