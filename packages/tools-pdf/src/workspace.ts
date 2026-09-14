import type { Finding, ToolContext, ToolDefinition, ToolWorkspaceMeta } from '@neotools/engine';
import { PDFDocument } from 'pdf-lib';
import { inspectPdf } from './inspect.js';
import { collectHits } from './redact/find.js';
import type { RedactHit, RedactPatternId } from './redact/types.js';

/**
 * Workspace hints for the PDF pack (FRONTEND-REDESIGN §2.15 A). Kept in one
 * place so the ActionBar order can be reviewed at a glance. Applied in
 * `index.ts`; tools that declare their own `workspace` win.
 */
export const PDF_WORKSPACE_META: Record<string, ToolWorkspaceMeta> = {
  'pdf-compress': { family: 'pdf', priority: 10, verb: 'transform', previewable: true },
  'pdf-reorder': { family: 'pdf', priority: 20, verb: 'transform', requires: [] },
  'pdf-rotate': { family: 'pdf', priority: 30, verb: 'transform' },
  'pdf-split': { family: 'pdf', priority: 40, verb: 'export' },
  'pdf-merge': { family: 'pdf', priority: 50, verb: 'transform', multiFile: true, requires: ['fileIds'] },
  'pdf-redact': { family: 'pdf', priority: 60, verb: 'protect', destructive: true, previewable: true },
  'pdf-sanitize': { family: 'pdf', priority: 70, verb: 'protect', destructive: true },
  'pdf-ocr': { family: 'pdf', priority: 80, verb: 'transform' },
  'pdf-forms': { family: 'pdf', priority: 90, verb: 'inspect' },
  'pdf-lock': { family: 'pdf', priority: 100, verb: 'protect' },
  'pdf-watermark': { family: 'pdf', priority: 110, verb: 'transform' },
  'pdf-a': { family: 'pdf', priority: 120, verb: 'export' },
  'pdf-sign': { family: 'pdf', priority: 130, verb: 'protect', desktopOnly: true },
  'pdf-metadata': { family: 'pdf', priority: 140, verb: 'inspect' },
  'pdf-page-numbers': { family: 'pdf', priority: 150, verb: 'transform' },
  'pdf-repair': { family: 'pdf', priority: 160, verb: 'transform' },
  'pdf-extract-text': { family: 'pdf', priority: 170, verb: 'export' },
  'pdf-to-images': { family: 'pdf', priority: 180, verb: 'export' },
  'pdf-ua': { family: 'pdf', priority: 190, verb: 'inspect' },
  'pdf-attachment-stamp': { family: 'pdf', priority: 200, verb: 'transform' },
  'pdf-aktenbundler': { family: 'pdf', priority: 210, verb: 'transform', multiFile: true, requires: ['fileIds'] },
  'pdf-compare': { family: 'pdf', priority: 220, verb: 'compare', multiFile: true, requires: ['fileIds'] },
  'pdf-form-mailmerge': { family: 'pdf', priority: 230, verb: 'transform' },
  'images-to-pdf': { family: 'image', priority: 300, verb: 'transform', multiFile: true },
};

export function applyPdfWorkspaceMeta(tools: ToolDefinition[]): void {
  for (const tool of tools) {
    if (!tool.workspace && PDF_WORKSPACE_META[tool.id]) tool.workspace = PDF_WORKSPACE_META[tool.id];
  }
}

const AUTO_PATTERNS: RedactPatternId[] = ['iban', 'steuer-id', 'sv-nummer', 'ausweisnummer', 'kennzeichen', 'email', 'telefon'];

const PATTERN_LABEL: Record<string, { de: string; en: string }> = {
  iban: { de: 'IBAN', en: 'IBAN' },
  'steuer-id': { de: 'Steuer-ID', en: 'Tax ID' },
  'sv-nummer': { de: 'SV-Nummer', en: 'Social security no.' },
  ausweisnummer: { de: 'Ausweisnummer', en: 'ID number' },
  kennzeichen: { de: 'Kennzeichen', en: 'License plate' },
  email: { de: 'E-Mail', en: 'Email' },
  telefon: { de: 'Telefon', en: 'Phone' },
};

function plural(n: number, de: [string, string], en: [string, string]): { de: string; en: string } {
  return { de: `${n} ${n === 1 ? de[0] : de[1]}`, en: `${n} ${n === 1 ? en[0] : en[1]}` };
}

export interface AnalyzePdfOptions {
  /** Skip the text-layer PII scan (structure only). */
  skipPii?: boolean;
  /** Abort scanning early. */
  signal?: AbortSignal;
}

/**
 * Fast, encode-free analysis for the workspace FindingBar (§2.15 F):
 * structure via pdf-lib (`inspectPdf`) + PII hits via the redact text scan.
 * Never throws — an unreadable file yields a single `warn` finding.
 */
export async function analyzePdf(
  bytes: Uint8Array,
  opts: AnalyzePdfOptions = {},
  _ctx?: ToolContext,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  let pageCount = 0;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    pageCount = doc.getPageCount();
    const info = inspectPdf(doc);
    if (info.hasJavaScript) {
      findings.push({
        id: 'js',
        kind: 'js',
        severity: 'high',
        label: { de: 'JavaScript', en: 'JavaScript' },
        suggestedToolId: 'pdf-sanitize',
      });
    }
    if (info.hasOpenAction || info.hasAA || info.hasLaunchActions || info.hasSubmitForm || info.hasImportData || info.hasGoToR) {
      findings.push({
        id: 'actions',
        kind: 'actions',
        severity: 'warn',
        label: { de: 'Aktionen beim Öffnen', en: 'Open actions' },
        suggestedToolId: 'pdf-sanitize',
      });
    }
    const attachments = info.embeddedFileNames.length + info.fileAttachmentAnnots;
    if (info.hasEmbeddedFiles) {
      const n = Math.max(1, attachments);
      findings.push({
        id: 'attachment',
        kind: 'attachment',
        severity: 'warn',
        label: plural(n, ['Anhang', 'Anhänge'], ['attachment', 'attachments']),
        count: n,
        suggestedToolId: 'pdf-sanitize',
      });
    }
    if (info.hasInfo || info.hasXmp) {
      findings.push({
        id: 'metadata',
        kind: 'metadata',
        severity: 'info',
        label: { de: 'Metadaten', en: 'Metadata' },
        suggestedToolId: 'pdf-sanitize',
      });
    }
    if (info.annotationCount > 0) {
      findings.push({
        id: 'annotations',
        kind: 'annotations',
        severity: 'info',
        label: plural(info.annotationCount, ['Annotation', 'Annotationen'], ['annotation', 'annotations']),
        count: info.annotationCount,
        suggestedToolId: 'pdf-sanitize',
        suggestedOptions: { removeAnnotations: true },
      });
    }
    if (info.hasAcroForm) {
      findings.push({
        id: 'form',
        kind: 'form',
        severity: 'info',
        label: { de: 'Formular', en: 'Form' },
        suggestedToolId: 'pdf-forms',
      });
    }
    if (info.hasEncrypt) {
      findings.push({
        id: 'encrypted',
        kind: 'encrypted',
        severity: 'warn',
        label: { de: 'Verschlüsselt', en: 'Encrypted' },
        suggestedToolId: 'pdf-lock',
        suggestedOptions: { mode: 'decrypt' },
      });
    }
  } catch {
    return [
      {
        id: 'unreadable',
        kind: 'unreadable',
        severity: 'warn',
        label: { de: 'PDF nicht lesbar — Reparatur?', en: 'PDF unreadable — repair?' },
        suggestedToolId: 'pdf-repair',
        suggestedOptions: {},
        count: 0,
      },
    ];
  }

  if (!opts.skipPii && !opts.signal?.aborted) {
    try {
      const found = await collectHits(bytes, { mode: 'auto', patterns: AUTO_PATTERNS, ner: false, regions: [] });
      const grouped = new Map<string, RedactHit[]>();
      for (const h of found.hits) {
        const list = grouped.get(h.pattern) ?? [];
        list.push(h);
        grouped.set(h.pattern, list);
      }
      for (const [pattern, hits] of grouped) {
        const label = PATTERN_LABEL[pattern] ?? { de: pattern, en: pattern };
        findings.push({
          id: `pii-${pattern}`,
          kind: pattern,
          severity: 'high',
          label: { de: `${hits.length} ${label.de}`, en: `${hits.length} ${label.en}` },
          count: hits.length,
          selection: {
            pages: [...new Set(hits.map((h) => h.page))].sort((a, b) => a - b),
            regions: hits.map((h) => ({ page: h.page, x: h.x, y: h.y, w: h.w, h: h.h, unit: 'pdf' as const })),
          },
          suggestedToolId: 'pdf-redact',
          suggestedOptions: { mode: 'auto', patterns: [pattern] },
        });
      }
      if (pageCount > 0 && found.maps.every((m) => !m.text.trim())) {
        findings.push({
          id: 'no-text',
          kind: 'no-text',
          severity: 'info',
          label: { de: 'Kein Textlayer — OCR?', en: 'No text layer — OCR?' },
          suggestedToolId: 'pdf-ocr',
        });
      }
    } catch {
      // text scan optional
    }
  }

  const order: Record<Finding['severity'], number> = { high: 0, warn: 1, info: 2 };
  return findings.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
}
