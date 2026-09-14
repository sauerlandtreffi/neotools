import { identifyBytes } from '../identify/identify.js';
import { inspectPdfHigh } from '../parsers/pdf-high.js';
import type { PdfTextRun } from '../parsers/pdf-content.js';

export interface WatermarkFinding {
  kind: 'text-angle' | 'large-faint' | 'annot' | 'recurring' | 'smask-hint' | 'image-unknown';
  detail: { de: string; en: string };
  page?: number;
}

export interface WatermarkReport {
  file: string;
  format: string;
  findings: WatermarkFinding[];
  note?: { de: string; en: string };
}

export async function findWatermarks(bytes: Uint8Array, name: string, mime?: string): Promise<WatermarkReport> {
  const id = identifyBytes(bytes, name, mime);
  const format = id.primary?.id ?? 'unknown';
  if (id.primary?.group === 'image' && format !== 'pdf') {
    return {
      file: name,
      format,
      findings: [
        {
          kind: 'image-unknown',
          detail: {
            de: 'Bild-Wasserzeichen ohne Modell unzuverlässig — Status unbekannt.',
            en: 'Image watermarks without a model are unreliable — status unknown.',
          },
        },
      ],
      note: {
        de: 'Nur Erkennung, kein Entfernen. Für Bilder keine verlässliche Heuristik ohne Modell.',
        en: 'Detection only, no removal. No reliable image heuristic without a model.',
      },
    };
  }
  if (format !== 'pdf') {
    return {
      file: name,
      format,
      findings: [],
      note: {
        de: 'Wasserzeichen-Heuristik gilt in Phase 1 für PDFs.',
        en: 'Watermark heuristics in phase 1 apply to PDFs.',
      },
    };
  }

  const high = await inspectPdfHigh(bytes);
  const findings: WatermarkFinding[] = [];
  if (!high) return { file: name, format, findings };

  if (high.watermarkAnnots > 0) {
    findings.push({
      kind: 'annot',
      detail: {
        de: `${high.watermarkAnnots} Annotation(en) Subtype /Watermark.`,
        en: `${high.watermarkAnnots} annotation(s) subtype /Watermark.`,
      },
    });
  }

  for (const r of high.content.watermarkRuns) {
    findings.push({
      kind: Math.abs(r.rotation) > 20 ? 'text-angle' : 'large-faint',
      page: r.page,
      detail: {
        de: `Text „${r.text.slice(0, 40)}“ Seite ${r.page}, Rotation ${r.rotation.toFixed(1)}°, Größe ${r.fontSize}, Opazität ${r.opacity ?? '—'}`,
        en: `Text “${r.text.slice(0, 40)}” page ${r.page}, rotation ${r.rotation.toFixed(1)}°, size ${r.fontSize}, opacity ${r.opacity ?? '—'}`,
      },
    });
  }

  const byText = new Map<string, PdfTextRun[]>();
  for (const r of high.content.runs) {
    const k = r.text.trim();
    if (k.length < 3) continue;
    const arr = byText.get(k) ?? [];
    arr.push(r);
    byText.set(k, arr);
  }
  if (high.pageCount >= 2) {
    for (const [text, runs] of byText) {
      const pages = new Set(runs.map((r) => r.page));
      if (pages.size === high.pageCount) {
        findings.push({
          kind: 'recurring',
          detail: {
            de: `Identischer Text „${text.slice(0, 40)}“ auf allen ${high.pageCount} Seiten.`,
            en: `Identical text “${text.slice(0, 40)}” on all ${high.pageCount} pages.`,
          },
        });
      }
    }
  }

  for (const [nameGs, op] of Object.entries(high.content.gsOpacities)) {
    if (op < 1) {
      findings.push({
        kind: 'large-faint',
        detail: {
          de: `ExtGState ${nameGs} mit CA/ca=${op}.`,
          en: `ExtGState ${nameGs} with CA/ca=${op}.`,
        },
      });
    }
  }

  if (high.xobjects.length && high.content.gsOpacities && Object.values(high.content.gsOpacities).some((v) => v < 1)) {
    findings.push({
      kind: 'smask-hint',
      detail: {
        de: `Bild-XObjects vorhanden (${high.xobjects.length}) plus halbtransparente ExtGState — mögliches Bild-Wasserzeichen.`,
        en: `Image XObjects present (${high.xobjects.length}) plus semi-transparent ExtGState — possible image watermark.`,
      },
    });
  }

  return {
    file: name,
    format,
    findings,
    note: {
      de: 'Nur Erkennung. Entfernen (Inpainting) ist bewusst nicht Bestandteil.',
      en: 'Detection only. Removal (inpainting) is intentionally out of scope.',
    },
  };
}

export function watermarkMarkdown(reports: WatermarkReport[], locale: 'de' | 'en'): string {
  const lines = [locale === 'de' ? '# Wasserzeichen finden\n' : '# Find watermarks\n'];
  for (const r of reports) {
    lines.push(`## ${r.file}\n`);
    if (r.note) lines.push(r.note[locale], '');
    if (!r.findings.length) {
      lines.push(locale === 'de' ? 'Keine typischen PDF-Wasserzeichen-Heuristiken.' : 'No typical PDF watermark heuristics.');
    }
    for (const f of r.findings) {
      lines.push(`- **${f.kind}**${f.page ? ` (p${f.page})` : ''}: ${f.detail[locale]}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
