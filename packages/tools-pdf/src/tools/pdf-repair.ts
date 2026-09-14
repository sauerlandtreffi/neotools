import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { copyPagesToNew, savePdf, stem } from '../pdf-io.js';
import { qpdfAvailable, qpdfRewrite } from '../qpdf/index.js';
import { openPdfjsDocument } from '../pdfjs.js';
import { renderPdfjsPage } from '../render-page.js';

const options = z.object({
  linearize: z.boolean().default(false),
});

export const pdfRepair = defineTool({
  id: 'pdf-repair',
  pack: 'pdf',
  category: 'pdf',
  title: { de: 'PDF reparieren', en: 'Repair PDF' },
  description: {
    de: 'xref/Objekte mit qpdf neu aufbauen; Fallback: pdf-lib-Kopie oder pdfjs-tolerantes Laden und Neuaufbau.',
    en: 'Rebuild xref/objects with qpdf; fallback: pdf-lib copy or tolerant pdfjs load and rebuild.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf repair', 'pdf reparieren', 'xref'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const reports: unknown[] = [];
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const input = await file.bytes();
      const repaired: string[] = [];
      const warnings: string[] = [];
      let bytes: Uint8Array | null = null;
      let method: 'qpdf' | 'pdflib-rebuild' | 'pdfjs-raster' = 'pdflib-rebuild';

      if (await qpdfAvailable()) {
        try {
          const extra = parsed.linearize
            ? ['--linearize', '--object-streams=generate']
            : ['--object-streams=generate'];
          bytes = await qpdfRewrite(input, extra);
          method = 'qpdf';
          repaired.push('xref/objects (qpdf)');
          if (parsed.linearize) repaired.push('linearize (Fast Web View)');
        } catch (err) {
          warnings.push(err instanceof Error ? err.message : String(err));
        }
      } else {
        warnings.push('qpdf-WASM nicht geladen — Fallback.');
      }

      if (!bytes) {
        try {
          const src = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false });
          const out = await copyPagesToNew(src, src.getPageIndices());
          const saved = await savePdf(out, 'tmp.pdf');
          bytes = await saved.bytes();
          method = 'pdflib-rebuild';
          repaired.push('Seiten nach pdf-lib kopiert');
        } catch (err) {
          warnings.push(err instanceof Error ? err.message : String(err));
        }
      }

      if (!bytes) {
        const pdf = await openPdfjsDocument(input);
        const out = await PDFDocument.create();
        for (let p = 1; p <= pdf.numPages; p++) {
          ctx.progress((i + p / pdf.numPages) / Math.max(files.length, 1), `${file.name} Seite ${p}`);
          const page = await pdf.getPage(p);
          const raster = await renderPdfjsPage(page, 144, ctx.platform);
          const png = await (async () => {
            if (ctx.platform.encodeRaster) {
              return ctx.platform.encodeRaster({
                mime: 'image/png',
                width: raster.width,
                height: raster.height,
                data: raster.data,
              });
            }
            const { encodePngRgba } = await import('../codecs/png-bytes.js');
            return encodePngRgba(raster.data, raster.width, raster.height);
          })();
          const img = await out.embedPng(png);
          const pg = out.addPage([img.width, img.height]);
          pg.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }
        await pdf.destroy();
        bytes = new Uint8Array(await out.save());
        method = 'pdfjs-raster';
        repaired.push('pdfjs-tolerant geladen, Seiten als Raster neu aufgebaut');
      }

      const pdfOut = neoFileFromBytes(`${stem(file.name)}-repaired.pdf`, bytes, MIME.pdf);
      const json = neoFileFromBytes(
        `${stem(file.name)}-repair-report.json`,
        new TextEncoder().encode(JSON.stringify({ file: file.name, method, repaired, warnings }, null, 2)),
        MIME.json,
      );
      outputs.push(pdfOut, json);
      reports.push({ file: file.name, method, repaired, warnings });
      return pdfOut;
    });
    const provenance = await createProvenance('pdf-repair', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, files: reports }, provenance),
    };
  },
});
