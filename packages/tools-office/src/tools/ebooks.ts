import { z } from 'zod';
import { MIME } from '@neotools/engine';
import { officeTool, finish, outFile, requireFile, firstText } from './common.js';
import { OFFICE_MIME } from '../mime.js';
import {
  chapterAsMarkdown,
  epubToPdf,
  epubToStandaloneHtml,
  fixEpubFonts,
  readEpub,
  unpackReport,
  writeEpub,
} from '../core/epub.js';
import { markdownToDoc } from '../core/markdown.js';
import { htmlToDoc } from '../core/html.js';
import { pdfBytesToDoc } from '../core/pdf-to-doc.js';
import { zipBytes, type ZipMap } from '../util/zip.js';
import { utf8 } from '../util/bytes.js';
import { stem } from '../util/bytes.js';

export const epubToPdfTool = officeTool({
  id: 'epub-to-pdf',
  pack: 'office',
  category: 'ebook',
  title: { de: 'EPUB zu PDF', en: 'EPUB to PDF' },
  description: { de: 'E-Book nach PDF mit Lesezeichen.', en: 'Ebook to PDF with bookmarks.' },
  inputs: { accept: [OFFICE_MIME.epub, '.epub'], multiple: false, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['epub pdf'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const book = readEpub(await file.bytes());
    const pdf = await epubToPdf(book);
    return finish(ctx, 'epub-to-pdf', files, opts, [outFile(opts.outputName || `${stem(file.name)}.pdf`, pdf.bytes, MIME.pdf)], pdf.warnings);
  },
});

export const epubToHtmlTool = officeTool({
  id: 'epub-to-html',
  pack: 'office',
  category: 'ebook',
  title: { de: 'EPUB zu HTML', en: 'EPUB to HTML' },
  description: { de: 'Kapitel als ein HTML-Dokument.', en: 'Chapters as one HTML document.' },
  inputs: { accept: [OFFICE_MIME.epub, '.epub'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.html] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['epub html'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const html = epubToStandaloneHtml(readEpub(await file.bytes()));
    return finish(ctx, 'epub-to-html', files, opts, [outFile(opts.outputName || `${stem(file.name)}.html`, utf8(html), OFFICE_MIME.html)]);
  },
});

export const epubUnpack = officeTool({
  id: 'epub-unpack',
  pack: 'office',
  category: 'ebook',
  title: { de: 'EPUB aufschrauben', en: 'Unpack EPUB' },
  description: { de: 'Struktur-Report plus Kapitel als HTML/Markdown.', en: 'Structure report plus chapters as HTML/Markdown.' },
  inputs: { accept: [OFFICE_MIME.epub, '.epub'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.zip] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['epub unpack'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const book = readEpub(await file.bytes());
    const zip: ZipMap = {};
    zip['REPORT.md'] = utf8(unpackReport(book));
    for (const ch of book.chapters) {
      const base = ch.href.replace(/[\\/]/g, '_').replace(/\.[^.]+$/, '');
      zip[`chapters/${base}.html`] = utf8(ch.html);
      zip[`chapters/${base}.md`] = utf8(chapterAsMarkdown(ch));
    }
    return finish(ctx, 'epub-unpack', files, opts, [outFile(opts.outputName || `${stem(file.name)}-unpacked.zip`, zipBytes(zip), OFFICE_MIME.zip)], [], { chapters: book.chapters.length });
  },
});

export const epubExtractImages = officeTool({
  id: 'epub-extract-images',
  pack: 'office',
  category: 'ebook',
  title: { de: 'EPUB-Bilder', en: 'EPUB images' },
  description: { de: 'Bilder aus dem EPUB extrahieren.', en: 'Extract images from the EPUB.' },
  inputs: { accept: [OFFICE_MIME.epub, '.epub'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.zip, MIME.png, MIME.jpeg] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['epub images'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const book = readEpub(await file.bytes());
    if (book.images.length === 1) {
      const img = book.images[0]!;
      return finish(ctx, 'epub-extract-images', files, opts, [outFile(img.href.split('/').pop() ?? 'image', img.bytes, img.mime)]);
    }
    const zip: ZipMap = {};
    for (const img of book.images) zip[img.href.replace(/[\\/]/g, '_')] = img.bytes;
    return finish(ctx, 'epub-extract-images', files, opts, [outFile(opts.outputName || `${stem(file.name)}-images.zip`, zipBytes(zip), OFFICE_MIME.zip)], book.images.length ? [] : ['Keine Bilder.'], { images: book.images.length });
  },
});

export const epubFixFonts = officeTool({
  id: 'epub-fix-fonts',
  pack: 'office',
  category: 'ebook',
  title: { de: 'EPUB-Fonts subsetten', en: 'Subset EPUB fonts' },
  description: { de: 'Schriften auf benutzte Zeichen reduzieren.', en: 'Reduce fonts to used characters.' },
  inputs: { accept: [OFFICE_MIME.epub, '.epub'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.epub, MIME.txt] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['epub fonts'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const { bytes, report } = await fixEpubFonts(await file.bytes());
    return finish(ctx, 'epub-fix-fonts', files, opts, [
      outFile(opts.outputName || `${stem(file.name)}-fixed.epub`, bytes, OFFICE_MIME.epub),
      outFile('font-report.txt', utf8(`${report}\n`), MIME.txt),
    ]);
  },
});

export const epubFromMarkdown = officeTool({
  id: 'epub-from-markdown',
  pack: 'office',
  category: 'ebook',
  title: { de: 'Markdown zu EPUB', en: 'Markdown to EPUB' },
  description: { de: 'MD/HTML-Kapitel zu EPUB, optionales Cover.', en: 'MD/HTML chapters to EPUB, optional cover.' },
  inputs: { accept: [MIME.md, '.md', OFFICE_MIME.html, '.html', MIME.png, MIME.jpeg], multiple: true, min: 1 },
  outputs: { mime: [OFFICE_MIME.epub] },
  options: z.object({ title: z.string().default(''), creator: z.string().default(''), language: z.string().default('de'), outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['markdown epub'] },
  async run(ctx, files, opts) {
    const chapters = [];
    let cover: { bytes: Uint8Array; mime: string } | undefined;
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (/\.(png|jpe?g|webp)$/.test(lower)) {
        cover = { bytes: await file.bytes(), mime: file.mime || 'image/jpeg' };
        continue;
      }
      const text = await firstText(file);
      const doc = lower.endsWith('.html') || lower.endsWith('.htm') ? htmlToDoc(text) : markdownToDoc(text);
      chapters.push({ title: doc.title || stem(file.name), doc });
    }
    if (!chapters.length) throw new Error('Kein Kapitel.');
    const bytes = await writeEpub({ title: opts.title || chapters[0]!.title, creator: opts.creator, language: opts.language, cover, chapters });
    return finish(ctx, 'epub-from-markdown', files, opts, [outFile(opts.outputName || `${(opts.title || 'book').replace(/\s+/g, '-')}.epub`, bytes, OFFICE_MIME.epub)]);
  },
});

export const pdfToEpub = officeTool({
  id: 'pdf-to-epub',
  pack: 'office',
  category: 'ebook',
  title: { de: 'PDF zu EPUB', en: 'PDF to EPUB' },
  description: { de: 'Textlayer + Überschriften-Heuristik nach Schriftgröße.', en: 'Text layer + heading heuristic by font size.' },
  inputs: { accept: [MIME.pdf, '.pdf'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.epub] },
  options: z.object({ title: z.string().default(''), outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['pdf epub'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const { doc, warnings } = await pdfBytesToDoc(await file.bytes());
    const bytes = await writeEpub({
      title: opts.title || doc.title || stem(file.name),
      chapters: [{ title: opts.title || doc.title || stem(file.name), doc }],
    });
    return finish(ctx, 'pdf-to-epub', files, opts, [outFile(opts.outputName || `${stem(file.name)}.epub`, bytes, OFFICE_MIME.epub)], warnings);
  },
});
