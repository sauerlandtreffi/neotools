import { describe, expect, it } from 'vitest';
import { computeDeadline } from '../src/deadline/bgb.js';
import { extractDates, resolveHits } from '../src/deadline/extract.js';

describe('§§ 187–193 BGB Fristen', () => {
  it('Zustellung Freitag + 2 Wochen → Samstag, Werktag Montag', () => {
    // 2026-01-09 is a Friday
    const d = computeDeadline('2026-01-09', 2, 'weeks', 'DE');
    expect(d.start).toBe('2026-01-10');
    expect(d.end).toBe('2026-01-24');
    expect(d.endWorkday).toBe('2026-01-26');
  });

  it('Monatsende Jan 31 + 1 Monat → Feb 28, Wochenende → Montag', () => {
    const d = computeDeadline('2026-01-31', 1, 'months', 'DE');
    expect(d.end).toBe('2026-02-28');
    expect(d.endWorkday).toBe('2026-03-02');
  });

  it('Ereignisfrist 1 Tag, Ende Neujahr → nächster Werktag', () => {
    const d = computeDeadline('2025-12-31', 1, 'days', 'DE');
    expect(d.end).toBe('2026-01-01');
    expect(d.endWorkday).toBe('2026-01-02');
  });

  it('relative Frist from Zustellung text', () => {
    const hits = extractDates([
      'Zugestellt am 09.01.2026.\nDie Stellungnahme ist binnen 2 Wochen ab Zustellung einzureichen.',
    ]);
    const resolved = resolveHits(hits, 'DE');
    const frist = resolved.find((h) => h.relative);
    expect(frist, JSON.stringify(hits)).toBeTruthy();
    expect(frist?.deadline).toBe('2026-01-26');
  });
});
