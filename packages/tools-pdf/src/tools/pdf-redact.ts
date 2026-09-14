import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import type { NeoFile, ToolContext, VerificationReport } from '@neotools/engine';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PDF_LICENSES } from '../licenses.js';
import { loadPdf, savePdfRewritten, stem } from '../pdf-io.js';
import { DEFAULT_PATTERNS } from '../redact/patterns.js';
import { collectHits } from '../redact/find.js';
import { rewritePageContent } from '../redact/content-stream.js';
import { blackoutOverlappingImages } from '../redact/images.js';
import { fillRgb, replacePagesWithRaster } from '../redact/raster.js';
import { collectMetaHits, scrubMetadata } from '../redact/metadata.js';
import { leftoverPages, verifyRedactedPdf } from '../redact/verify.js';
import type { RedactFileReport, RedactHit } from '../redact/types.js';

const regionSchema = z.object({
  page: z.coerce.number().int().positive(),
  x: z.coerce.number(),
  y: z.coerce.number(),
  w: z.coerce.number(),
  h: z.coerce.number(),
});

export const pdfRedactOptions = z.object({
  mode: z.enum(['auto', 'manual', 'both']).default('auto'),
  patterns: z
    .array(
      z.enum([
        'iban',
        'steuer-id',
        'sv-nummer',
        'ausweisnummer',
        'kennzeichen',
        'email',
        'telefon',
        'datum',
        'betrag',
        'custom',
      ]),
    )
    .default(() => [...DEFAULT_PATTERNS]),
  customRegex: z.array(z.string()).optional(),
  ner: z.boolean().default(false),
  regions: z.array(regionSchema).default([]),
  fillColor: z.string().default('#000000'),
  label: z.string().optional(),
  rasterizeFallback: z.boolean().default(true),
  ocrScanned: z.boolean().default(false),
});

function summarizeHits(hits: RedactHit[]): RedactFileReport['hits'] {
  const key = new Map<string, { pattern: RedactHit['pattern']; page: number; count: number; masked: string }>();
  for (const h of hits) {
    const id = `${h.pattern}:${h.page}`;
    const cur = key.get(id);
    if (cur) cur.count += 1;
    else key.set(id, { pattern: h.pattern, page: h.page, count: 1, masked: h.masked });
  }
  return [...key.values()];
}

function drawBoxes(
  page: import('pdf-lib').PDFPage,
  hits: RedactHit[],
  color: { r: number; g: number; b: number },
  label: string | undefined,
  font: import('pdf-lib').PDFFont,
): void {
  for (const h of hits) {
    page.drawRectangle({
      x: h.x,
      y: h.y,
      width: Math.max(h.w, 2),
      height: Math.max(h.h, 2),
      color: rgb(color.r, color.g, color.b),
      borderWidth: 0,
    });
    if (label) {
      const size = Math.min(8, Math.max(6, h.h - 2));
      page.drawText(label, {
        x: h.x + 1,
        y: h.y + 1,
        size,
        font,
        color: rgb(1, 1, 1),
      });
    }
  }
}

async function redactOne(
  ctx: ToolContext,
  file: NeoFile,
  opts: z.infer<typeof pdfRedactOptions>,
): Promise<{ pdf: NeoFile; json: NeoFile; report: RedactFileReport }> {
  const source = await file.bytes();
  const found = await collectHits(
    source,
    {
      mode: opts.mode,
      patterns: opts.patterns,
      customRegex: opts.customRegex,
      ner: opts.ner,
      regions: opts.regions,
      ocrScanned: opts.ocrScanned,
    },
    ctx,
  );
  const hits = found.hits.filter((h) => h.selected !== false);
  const warnings = [...found.warnings];
  const fill = fillRgb(opts.fillColor);

  let doc = await loadPdf(file);
  if (opts.mode !== 'manual') {
    // Info/XMP/Outline/StructTree/Annotations/AP streams are invisible to pdf.js text extraction
    const metaHits = collectMetaHits(doc, opts.patterns, opts.customRegex ?? []);
    if (metaHits.length) {
      hits.push(...metaHits);
      warnings.push(`${metaHits.length} Treffer in Metadaten/Annotationen entfernt`);
    }
  }
  scrubMetadata(doc, hits);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const hardPages = new Set<number>();
  for (let i = 0; i < doc.getPageCount(); i++) {
    const pageNo = i + 1;
    const pageHits = hits.filter((h) => h.page === pageNo);
    const page = doc.getPage(i);
    const rewritten = rewritePageContent(page, pageHits, pageNo);
    if (rewritten.hard) hardPages.add(pageNo);
    const visible = pageHits.filter((h) => h.w > 0 && h.h > 0);
    const imgWarn = await blackoutOverlappingImages(doc, page, rewritten.imageDos, visible);
    warnings.push(...imgWarn);
    drawBoxes(page, visible, fill, opts.label, font);
  }

  let pdfFile = await savePdfRewritten(doc, `${stem(file.name)}-redacted.pdf`);
  let bytes = await pdfFile.bytes();
  const needles = hits.map((h) => h.text).filter((t) => t.trim().length >= 3);
  const leftover = await leftoverPages(bytes, needles, opts.mode === 'manual' ? [] : opts.patterns, opts.customRegex ?? []);
  const rasterized: number[] = [];

  if (leftover.length || hardPages.size) {
    const pages = [...new Set([...leftover, ...hardPages])];
    if (opts.rasterizeFallback) {
      doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const replaced = await replacePagesWithRaster(doc, bytes, pages, hits, fill);
      doc = replaced.doc;
      rasterized.push(...replaced.rasterized);
      for (const p of replaced.rasterized) warnings.push(`Seite ${p} gerastert`);
      for (const p of replaced.skipped) warnings.push(`Seite ${p}: Rasterisierung nicht möglich`);
      pdfFile = await savePdfRewritten(doc, `${stem(file.name)}-redacted.pdf`);
      bytes = await pdfFile.bytes();
    } else {
      for (const p of leftover) warnings.push(`Seite ${p}: Textreste nach Stream-Rewrite`);
    }
  }

  const fileReport: RedactFileReport = {
    file: file.name,
    hits: summarizeHits(hits),
    rasterizedPages: rasterized,
    warnings,
  };
  const json = neoFileFromBytes(
    `${stem(file.name)}-redact-report.json`,
    new TextEncoder().encode(
      JSON.stringify(
        {
          file: file.name,
          hits,
          summary: fileReport.hits,
          rasterizedPages: rasterized,
          warnings,
        },
        null,
        2,
      ),
    ),
    MIME.json,
  );
  return { pdf: pdfFile, json, report: fileReport };
}

export const pdfRedact = defineTool({
  id: 'pdf-redact',
  pack: 'pdf',
  category: 'privacy',
  title: { de: 'PDF schwärzen', en: 'Redact PDF' },
  description: {
    de: 'Schwärzt IBAN, Steuer-ID, Kennzeichen und weitere Muster — Text wirklich entfernen, nicht nur übermalen. Danach Verifikation.',
    en: 'Redacts IBAN, tax IDs, plates and more — removes text objects, not just overlays. Then verifies.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options: pdfRedactOptions,
  privacySensitive: true,
  ui: { editor: 'redact' },
  presets: [
    {
      id: 'auto-de',
      title: { de: 'Auto DACH', en: 'Auto DACH' },
      options: { mode: 'auto', ner: false, rasterizeFallback: true },
    },
    {
      id: 'manual',
      title: { de: 'Nur Markierungen', en: 'Marks only' },
      options: { mode: 'manual', ner: false },
    },
    {
      id: 'auto-ner',
      title: { de: 'Auto + Namen', en: 'Auto + names' },
      options: { mode: 'auto', ner: true },
    },
  ],
  licenses: PDF_LICENSES,
  seo: {
    keywords: ['pdf schwärzen', 'redact', 'iban', 'steuer-id'],
    faq: [
      {
        q: { de: 'Wird der Text wirklich gelöscht?', en: 'Is the text actually removed?' },
        a: {
          de: 'Ja. Content-Streams werden umgeschrieben (Tj/TJ), nicht nur übermalt. Wo das nicht gelingt, wird die Seite gerastert.',
          en: 'Yes. Content streams are rewritten (Tj/TJ), not just painted over. Pages that cannot be cleaned are rasterized.',
        },
      },
    ],
  },
  async run(ctx, files, raw) {
    const opts = pdfRedactOptions.parse(raw);
    const outputs: NeoFile[] = [];
    const reports: RedactFileReport[] = [];
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const result = await redactOne(ctx, file, opts);
      outputs.push(result.pdf, result.json);
      reports.push(result.report);
      return result.pdf;
    });
    const provenance = await createProvenance('pdf-redact', opts, files);
    return {
      outputs,
      warnings: [
        ...loaded.errors.map((e) => `${e.file}: ${e.reason}`),
        ...reports.flatMap((r) => r.warnings),
      ],
      report: attachProvenance(
        { batch: loaded.protocol, files: reports, hits: reports.flatMap((r) => r.hits) },
        provenance,
      ),
    };
  },
  async verify(ctx, outputs, raw): Promise<VerificationReport> {
    const opts = pdfRedactOptions.parse(raw);
    const hits: RedactHit[] = [];
    const strings: string[] = [];
    for (const file of outputs) {
      if (file.mime !== MIME.json) continue;
      try {
        const parsed = JSON.parse(new TextDecoder().decode(await file.bytes())) as {
          hits?: RedactHit[];
        };
        for (const h of parsed.hits ?? []) {
          hits.push(h);
          if (h.text) strings.push(h.text);
        }
      } catch {
        // ignore
      }
    }
    return verifyRedactedPdf(ctx, outputs, {
      mode: opts.mode,
      patterns: opts.patterns,
      customRegex: opts.customRegex,
      strings,
      hits,
      fillColor: opts.fillColor,
    });
  },
});
