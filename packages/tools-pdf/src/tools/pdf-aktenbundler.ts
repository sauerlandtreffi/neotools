import { z } from 'zod';
import { PDFDocument } from 'pdf-lib';
import {
  MIME,
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
} from '@neotools/engine';
import { PDF_LICENSES } from '../licenses.js';
import { assembleAkte, type BundleOptions } from '../akten/bundle.js';

const IMAGE = [MIME.jpeg, MIME.png, 'image/jpg'];

const options = z.object({
  title: z.string().default('Akte'),
  aktenzeichen: z.string().default(''),
  parteien: z.string().default(''),
  datum: z.string().default(''),
  cover: z.boolean().default(true),
  toc: z.boolean().default(true),
  separators: z.boolean().default(false),
  inheritOutlines: z.boolean().default(true),
  batesPrefix: z.string().default(''),
  batesStart: z.coerce.number().int().min(0).default(1),
  batesDigits: z.coerce.number().int().min(1).max(8).default(4),
  batesPosition: z.enum(['footer-right', 'footer-center', 'footer-left']).default('footer-right'),
  headerAktenzeichen: z.boolean().default(true),
  anlagenPrefix: z.string().default(''),
  outputName: z.string().default('akte.pdf'),
});

function isImage(file: { name: string; mime: string }): boolean {
  const n = file.name.toLowerCase();
  return IMAGE.includes(file.mime) || n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg');
}

export const pdfAktenbundler = defineTool({
  id: 'pdf-aktenbundler',
  pack: 'pdf',
  category: 'organize',
  title: { de: 'Aktenbundler', en: 'Case file binder' },
  description: {
    de: 'Mehrere PDFs/Bilder zu einer Akte: Deckblatt, Inhaltsverzeichnis mit Links, Lesezeichen, Bates-Nummern, Kopfzeile.',
    en: 'Bind PDFs/images into a case file: cover, linked TOC, bookmarks, Bates numbers, header.',
  },
  inputs: { accept: [MIME.pdf, ...IMAGE], multiple: true, min: 1 },
  outputs: { mime: [MIME.pdf, MIME.json] },
  options,
  presets: [
    {
      id: 'akte',
      title: { de: 'Akte mit TOC', en: 'File with TOC' },
      options: { cover: true, toc: true, inheritOutlines: true },
    },
    {
      id: 'anlagen',
      title: { de: 'Mit Anlagen-Stempel', en: 'With exhibit stamps' },
      options: { cover: true, toc: true, anlagenPrefix: 'Anlage K' },
    },
  ],
  licenses: PDF_LICENSES,
  seo: { keywords: ['aktenbundler', 'bates', 'inhaltsverzeichnis', 'lesezeichen'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const sources: Array<{ file: (typeof files)[number]; doc: PDFDocument; kind: 'pdf' | 'image' }> = [];
    const warnings: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      ctx.progress(i / Math.max(files.length, 1), file.name);
      if (isImage(file)) {
        sources.push({ file, doc: await PDFDocument.create(), kind: 'image' });
        continue;
      }
      try {
        const doc = await PDFDocument.load(await file.bytes(), { ignoreEncryption: false, updateMetadata: false });
        sources.push({ file, doc, kind: 'pdf' });
      } catch (err) {
        warnings.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!sources.length) {
      return { outputs: [], warnings: warnings.length ? warnings : ['Keine gültigen Quellen.'], report: {} };
    }
    const bundleOpts: BundleOptions = {
      title: parsed.title,
      aktenzeichen: parsed.aktenzeichen,
      parteien: parsed.parteien,
      datum: parsed.datum,
      cover: parsed.cover,
      toc: parsed.toc,
      separators: parsed.separators,
      batesPrefix: parsed.batesPrefix,
      batesStart: parsed.batesStart,
      batesDigits: parsed.batesDigits,
      batesPosition: parsed.batesPosition,
      headerAktenzeichen: parsed.headerAktenzeichen,
      anlagenPrefix: parsed.anlagenPrefix,
      inheritOutlines: parsed.inheritOutlines,
    };
    const { bytes, index } = await assembleAkte(sources, bundleOpts);
    const provenance = await createProvenance('pdf-aktenbundler', parsed, files);
    return {
      outputs: [
        neoFileFromBytes(parsed.outputName, bytes, MIME.pdf),
        neoFileFromBytes('akte-index.json', new TextEncoder().encode(JSON.stringify(index, null, 2)), MIME.json),
      ],
      warnings,
      report: attachProvenance({ index }, provenance),
    };
  },
});
