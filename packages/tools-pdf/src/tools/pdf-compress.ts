import { z } from 'zod';
import {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib';
import { zlibSync } from 'fflate';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { clearInfoDict, stripXmp } from '../inspect.js';
import { stem } from '../pdf-io.js';
import { recompressPageImages, type ImageDecision } from '../compress/images.js';
import { qpdfAvailable, qpdfRewrite } from '../qpdf/index.js';

const PRESETS = {
  light: { dpi: 200, quality: 85, grayscale: false },
  medium: { dpi: 150, quality: 75, grayscale: false },
  heavy: { dpi: 96, quality: 60, grayscale: false },
  scan: { dpi: 150, quality: 70, grayscale: true },
} as const;

const options = z.object({
  preset: z.enum(['light', 'medium', 'heavy', 'scan']).default('medium'),
  targetSizeMb: z.coerce.number().positive().optional(),
  linearize: z.boolean().default(false),
  stripMetadata: z.boolean().default(true),
});

function filtersOf(dict: PDFDict): string[] {
  const f = dict.lookup(PDFName.of('Filter'));
  if (f instanceof PDFName) return [f.toString().replace(/^\//, '')];
  return [];
}

function recompressFlateStreams(doc: PDFDocument): number {
  let changed = 0;
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const filters = filtersOf(obj.dict);
    if (!filters.includes('FlateDecode')) continue;
    if (filters.includes('DCTDecode') || filters.includes('JPXDecode')) continue;
    try {
      const decoded = decodePDFRawStream(obj).decode();
      const next = zlibSync(decoded, { level: 9 });
      if (next.length < obj.contents.length) {
        (obj as { contents: Uint8Array }).contents = next;
        obj.dict.set(PDFName.of('Length'), PDFNumber.of(next.length));
        changed += 1;
      }
    } catch {
      // leave stream
    }
  }
  return changed;
}

function stripExtras(doc: PDFDocument): string[] {
  const removed: string[] = [];
  if (stripXmp(doc)) removed.push('xmp');
  const keys = clearInfoDict(doc);
  if (keys.length) removed.push('info');
  const catalog = doc.catalog;
  if (catalog.has(PDFName.of('PieceInfo'))) {
    catalog.delete(PDFName.of('PieceInfo'));
    removed.push('catalog.PieceInfo');
  }
  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of('Thumb'))) {
      page.node.delete(PDFName.of('Thumb'));
      removed.push('page.Thumb');
    }
    if (page.node.has(PDFName.of('PieceInfo'))) {
      page.node.delete(PDFName.of('PieceInfo'));
      removed.push('page.PieceInfo');
    }
  }
  return [...new Set(removed)];
}

async function compressOnce(
  input: Uint8Array,
  preset: keyof typeof PRESETS,
  linearize: boolean,
  stripMeta: boolean,
  quality: number = PRESETS[preset].quality,
  dpi: number = PRESETS[preset].dpi,
  progress?: (value: number, message?: string) => void,
): Promise<{
  bytes: Uint8Array;
  decisions: ImageDecision[];
  warnings: string[];
  stripped: string[];
  flate: number;
  qpdf: boolean;
}> {
  const spec = PRESETS[preset];
  const doc = await PDFDocument.load(input, { ignoreEncryption: false, updateMetadata: false });
  const { decisions, warnings } = await recompressPageImages(
    doc,
    {
      dpi,
      quality,
      grayscale: spec.grayscale,
      pageWidthPt: 595,
      pageHeightPt: 842,
    },
    (page, total) => progress?.((page - 1) / Math.max(total, 1), `Bilder Seite ${page}/${total}`),
  );
  const stripped = stripMeta ? stripExtras(doc) : [];
  const flate = recompressFlateStreams(doc);
  let bytes = new Uint8Array(await doc.save({ useObjectStreams: true, updateFieldAppearances: false }));
  let usedQpdf = false;
  if (await qpdfAvailable()) {
    try {
      const extra = [
        '--object-streams=generate',
        '--compress-streams=y',
        '--recompress-flate',
        ...(linearize ? ['--linearize'] : []),
      ];
      bytes = new Uint8Array(await qpdfRewrite(bytes, extra));
      usedQpdf = true;
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { bytes, decisions, warnings, stripped, flate, qpdf: usedQpdf };
}

export const pdfCompress = defineTool({
  id: 'pdf-compress',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'PDF komprimieren', en: 'Compress PDF' },
  description: {
    de: 'Bilder neu kodieren (jSquash mozjpeg/oxipng), Downsampling, Flate, Metadaten entfernen. Optional Zielgröße (Make it fit).',
    en: 'Re-encode images (jSquash mozjpeg/oxipng), downsample, Flate, strip metadata. Optional target size (make it fit).',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  presets: [
    { id: 'light', title: { de: 'Leicht 200 dpi', en: 'Light 200 dpi' }, options: { preset: 'light' } },
    { id: 'medium', title: { de: 'Mittel 150 dpi', en: 'Medium 150 dpi' }, options: { preset: 'medium' } },
    { id: 'heavy', title: { de: 'Stark 96 dpi', en: 'Heavy 96 dpi' }, options: { preset: 'heavy' } },
    { id: 'scan', title: { de: 'Scan Graustufen', en: 'Scan grayscale' }, options: { preset: 'scan' } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf komprimieren', 'pdf compress', 'mozjpeg'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const reports: unknown[] = [];
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), `${file.name} komprimieren`);
      const input = await file.bytes();
      const before = input.byteLength;
      let best = await compressOnce(
        input,
        parsed.preset,
        parsed.linearize,
        parsed.stripMetadata,
        PRESETS[parsed.preset].quality,
        PRESETS[parsed.preset].dpi,
        (v, m) => ctx.progress((i + v) / Math.max(files.length, 1), m),
      );
      if (parsed.targetSizeMb) {
        const target = parsed.targetSizeMb * 1024 * 1024;
        if (best.bytes.byteLength > target) {
          let lo = 30;
          let hi: number = PRESETS[parsed.preset].quality;
          for (let step = 0; step < 5 && best.bytes.byteLength > target; step++) {
            const q = Math.round((lo + hi) / 2);
            ctx.progress((i + 0.4 + step * 0.1) / Math.max(files.length, 1), `Qualität ${q}`);
            const attempt = await compressOnce(
              input,
              parsed.preset,
              parsed.linearize,
              parsed.stripMetadata,
              q,
              PRESETS[parsed.preset].dpi,
            );
            if (attempt.bytes.byteLength <= target) {
              best = attempt;
              hi = q;
            } else {
              best = attempt.bytes.byteLength < best.bytes.byteLength ? attempt : best;
              hi = q - 1;
            }
            if (hi < lo) break;
          }
          if (best.bytes.byteLength > target) {
            const attempt = await compressOnce(input, 'heavy', parsed.linearize, parsed.stripMetadata, 40, 72);
            if (attempt.bytes.byteLength < best.bytes.byteLength) best = attempt;
          }
        }
      }
      const pdf = neoFileFromBytes(`${stem(file.name)}-compressed.pdf`, best.bytes, MIME.pdf);
      const report = {
        file: file.name,
        beforeBytes: before,
        afterBytes: best.bytes.byteLength,
        ratio: before ? best.bytes.byteLength / before : 1,
        images: best.decisions,
        stripped: best.stripped,
        flateStreams: best.flate,
        qpdfObjectStreams: best.qpdf,
        warnings: best.warnings,
      };
      const json = neoFileFromBytes(
        `${stem(file.name)}-compress-report.json`,
        new TextEncoder().encode(JSON.stringify(report, null, 2)),
        MIME.json,
      );
      outputs.push(pdf, json);
      reports.push(report);
      return pdf;
    });
    const provenance = await createProvenance('pdf-compress', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, files: reports }, provenance),
    };
  },
});
