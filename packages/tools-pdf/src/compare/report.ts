import type { PixelCompareResult } from './pixel.js';
import type { TextCompareResult, WordChange } from './text.js';

export interface CompareJsonReport {
  mode: string;
  layout: string;
  left: string;
  right: string;
  summary: {
    changes: number;
    inserts: number;
    deletes: number;
    replaces: number;
    paragraphsRemoved: number;
    paragraphsAdded: number;
    pagesAdded: number[];
    pagesRemoved: number[];
  };
  changes: WordChange[];
  pixel?: {
    skipped: boolean;
    reason?: string;
    pages: Array<{ pageLeft: number; pageRight: number; changedRatio: number; ssim: number }>;
  };
}

export function buildCompareReport(
  mode: string,
  layout: string,
  leftName: string,
  rightName: string,
  text: TextCompareResult,
  pixel?: PixelCompareResult,
): CompareJsonReport {
  const inserts = text.changes.filter((c) => c.kind === 'insert').length;
  const deletes = text.changes.filter((c) => c.kind === 'delete').length;
  const replaces = text.changes.filter((c) => c.kind === 'replace').length;
  return {
    mode,
    layout,
    left: leftName,
    right: rightName,
    summary: {
      changes: text.changes.length,
      inserts,
      deletes,
      replaces,
      paragraphsRemoved: text.paragraphsRemoved,
      paragraphsAdded: text.paragraphsAdded,
      pagesAdded: text.pagesAdded,
      pagesRemoved: text.pagesRemoved,
    },
    changes: text.changes,
    pixel: pixel
      ? {
          skipped: pixel.skipped,
          reason: pixel.reason,
          pages: pixel.pages.map((p) => ({
            pageLeft: p.pageLeft,
            pageRight: p.pageRight,
            changedRatio: p.changedRatio,
            ssim: p.ssim,
          })),
        }
      : undefined,
  };
}

export function compareMarkdown(report: CompareJsonReport, locale: 'de' | 'en'): string {
  const s = report.summary;
  if (locale === 'en') {
    const lines = [
      `# PDF compare`,
      ``,
      `${s.changes} changes, ${s.deletes} deletions, ${s.inserts} insertions, ${s.replaces} replacements.`,
      `${s.paragraphsRemoved} paragraphs removed, ${s.paragraphsAdded} paragraphs added.`,
      s.pagesAdded.length ? `New pages: ${s.pagesAdded.join(', ')}.` : `No new pages.`,
      s.pagesRemoved.length ? `Removed pages: ${s.pagesRemoved.join(', ')}.` : `No removed pages.`,
      ``,
      `## Changes`,
    ];
    for (const c of report.changes) {
      lines.push(`- **${c.kind}** (L${c.pageLeft ?? '—'} / R${c.pageRight ?? '—'}): ${c.excerpt}`);
    }
    if (report.pixel?.skipped) lines.push(``, `Pixel: skipped (${report.pixel.reason})`);
    else if (report.pixel) {
      lines.push(``, `## Pixel`);
      for (const p of report.pixel.pages) {
        lines.push(`- pages ${p.pageLeft}/${p.pageRight}: ${(p.changedRatio * 100).toFixed(2)}% changed, SSIM ${p.ssim.toFixed(3)}`);
      }
    }
    return lines.join('\n') + '\n';
  }
  const pageNew = s.pagesAdded.length ? `Seite ${s.pagesAdded.join(', ')} neu` : 'keine neue Seite';
  const lines = [
    `# PDF-Vergleich`,
    ``,
    `${s.changes} Änderungen, ${s.deletes} Absätze/Wörter entfernt, ${s.inserts} eingefügt, ${s.replaces} ersetzt, ${pageNew}.`,
    `${s.paragraphsRemoved} Absätze entfernt, ${s.paragraphsAdded} Absätze hinzugefügt.`,
    ``,
    `## Änderungen`,
  ];
  for (const c of report.changes) {
    const kind =
      c.kind === 'insert' ? 'Einfügung' : c.kind === 'delete' ? 'Löschung' : 'Ersetzung';
    lines.push(`- **${kind}** (L${c.pageLeft ?? '—'} / R${c.pageRight ?? '—'}): ${c.excerpt}`);
  }
  if (report.pixel?.skipped) lines.push(``, `Pixel: übersprungen (${report.pixel.reason})`);
  else if (report.pixel) {
    lines.push(``, `## Pixel`);
    for (const p of report.pixel.pages) {
      lines.push(`- Seiten ${p.pageLeft}/${p.pageRight}: ${(p.changedRatio * 100).toFixed(2)} % geändert, SSIM ${p.ssim.toFixed(3)}`);
    }
  }
  return lines.join('\n') + '\n';
}
