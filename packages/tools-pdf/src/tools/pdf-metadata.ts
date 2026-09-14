import { z } from 'zod';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  mapFiles,
  neoFileFromBytes,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { clearInfoDict, inspectPdf, stripXmp } from '../inspect.js';
import { loadPdf, savePdf, stem } from '../pdf-io.js';

const options = z.object({
  mode: z.enum(['read', 'set', 'clear']).default('read'),
  stripXmp: z.boolean().default(true),
  title: z.string().optional(),
  author: z.string().optional(),
  subject: z.string().optional(),
  keywords: z.string().optional(),
  creator: z.string().optional(),
  producer: z.string().optional(),
  creationDate: z.string().optional(),
  modificationDate: z.string().optional(),
});

function readMeta(doc: Awaited<ReturnType<typeof loadPdf>>) {
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    creationDate: doc.getCreationDate()?.toISOString() ?? '',
    modificationDate: doc.getModificationDate()?.toISOString() ?? '',
    inspection: inspectPdf(doc),
  };
}

export const pdfMetadata = defineTool({
  id: 'pdf-metadata',
  pack: 'pdf',
  category: 'privacy',
  title: { de: 'Metadaten', en: 'Metadata' },
  description: {
    de: 'Metadaten lesen, setzen oder entfernen (Title, Author, Subject, Keywords, Creator, Producer, Daten) und XMP strippen.',
    en: 'Read, set or clear metadata (Title, Author, Subject, Keywords, Creator, Producer, dates) and strip XMP.',
  },
  inputs: { accept: [MIME.pdf], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  presets: [
    { id: 'read', title: { de: 'Nur lesen', en: 'Read only' }, options: { mode: 'read' } },
    { id: 'wipe', title: { de: 'Alles entfernen', en: 'Clear all' }, options: { mode: 'clear', stripXmp: true } },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['pdf metadaten', 'xmp', 'datenschutz'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const outputs: ReturnType<typeof neoFileFromBytes>[] = [];
    const reports: unknown[] = [];
    const loaded = await mapFiles(files, async (file, i) => {
      ctx.progress(i / Math.max(files.length, 1), file.name);
      const doc = await loadPdf(file);
      const before = readMeta(doc);
      if (parsed.mode === 'read') {
        const json = neoFileFromBytes(
          `${stem(file.name)}-metadata.json`,
          new TextEncoder().encode(JSON.stringify(before, null, 2)),
          MIME.json,
        );
        outputs.push(json);
        reports.push({ file: file.name, before });
        return json;
      }
      if (parsed.mode === 'clear') {
        clearInfoDict(doc);
        if (parsed.stripXmp) stripXmp(doc);
      } else {
        if (parsed.title !== undefined) doc.setTitle(parsed.title);
        if (parsed.author !== undefined) doc.setAuthor(parsed.author);
        if (parsed.subject !== undefined) doc.setSubject(parsed.subject);
        if (parsed.keywords !== undefined) {
          doc.setKeywords(parsed.keywords.split(',').map((s) => s.trim()).filter(Boolean));
        }
        if (parsed.creator !== undefined) doc.setCreator(parsed.creator);
        if (parsed.producer !== undefined) doc.setProducer(parsed.producer);
        if (parsed.creationDate) {
          const d = new Date(parsed.creationDate);
          if (!Number.isNaN(d.getTime())) doc.setCreationDate(d);
        }
        if (parsed.modificationDate) {
          const d = new Date(parsed.modificationDate);
          if (!Number.isNaN(d.getTime())) doc.setModificationDate(d);
        } else {
          doc.setModificationDate(new Date());
        }
        if (parsed.stripXmp) stripXmp(doc);
      }
      const after = readMeta(doc);
      const pdf = await savePdf(doc, `${stem(file.name)}-meta.pdf`);
      outputs.push(pdf);
      reports.push({ file: file.name, before, after });
      return pdf;
    });
    const provenance = await createProvenance('pdf-metadata', parsed, files);
    return {
      outputs,
      warnings: loaded.errors.map((e) => `${e.file}: ${e.reason}`),
      report: attachProvenance({ batch: loaded.protocol, files: reports }, provenance),
    };
  },
});
