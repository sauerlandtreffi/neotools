import { z } from 'zod';
import { MIME } from '@neotools/engine';
import { officeTool, finish, outFile, pageOpt, requireFile, themeOpt, firstText } from './common.js';
import { OFFICE_MIME } from '../mime.js';
import { readDocxWithFallback, writeDocx, docxToPlainText } from '../core/docx.js';
import { markdownToDoc, docToMarkdown, highlightCode } from '../core/markdown.js';
import { htmlToDoc, docToHtml } from '../core/html.js';
import { renderDocToPdf, renderPlainTextToPdf } from '../core/pdf-render.js';
import { stem } from '../util/bytes.js';

const pdfOpts = z.object({
  page: pageOpt,
  theme: themeOpt,
  titlePage: z.boolean().default(false),
  toc: z.boolean().default(false),
  outputName: z.string().default(''),
});

async function docxIn(file: ReturnType<typeof requireFile>) {
  return readDocxWithFallback(await file.bytes());
}

export const docxToPdf = officeTool({
  id: 'docx-to-pdf',
  pack: 'office',
  category: 'office',
  title: { de: 'DOCX zu PDF', en: 'DOCX to PDF' },
  description: { de: 'Word-Dokument lokal nach PDF mit selektierbarem Text.', en: 'Word document to PDF with selectable text.' },
  inputs: { accept: [OFFICE_MIME.docx, '.docx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options: pdfOpts,
  licenses: [],
  seo: { keywords: ['docx to pdf', 'word zu pdf'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    ctx.progress(0.2, file.name);
    const { doc, warnings } = await docxIn(file);
    const pdf = await renderDocToPdf(doc, { page: opts.page, theme: opts.theme, titlePage: opts.titlePage, toc: opts.toc, title: doc.title });
    return finish(ctx, 'docx-to-pdf', files, opts, [outFile(opts.outputName || `${stem(file.name)}.pdf`, pdf.bytes, MIME.pdf)], [...warnings, ...pdf.warnings], { pages: pdf.pageCount });
  },
});

export const docxToMarkdown = officeTool({
  id: 'docx-to-markdown',
  pack: 'office',
  category: 'office',
  title: { de: 'DOCX zu Markdown', en: 'DOCX to Markdown' },
  description: { de: 'Word nach Markdown (GFM).', en: 'Word to Markdown (GFM).' },
  inputs: { accept: [OFFICE_MIME.docx, '.docx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.md] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['docx markdown'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const { doc, warnings } = await docxIn(file);
    return finish(ctx, 'docx-to-markdown', files, opts, [outFile(opts.outputName || `${stem(file.name)}.md`, new TextEncoder().encode(docToMarkdown(doc)), MIME.md)], warnings);
  },
});

export const docxToHtml = officeTool({
  id: 'docx-to-html',
  pack: 'office',
  category: 'office',
  title: { de: 'DOCX zu HTML', en: 'DOCX to HTML' },
  description: { de: 'Word nach eigenständigem HTML.', en: 'Word to standalone HTML.' },
  inputs: { accept: [OFFICE_MIME.docx, '.docx'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.html] },
  options: z.object({ theme: themeOpt, outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['docx html'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const { doc, warnings } = await docxIn(file);
    const html = docToHtml(doc, { standalone: true, theme: opts.theme, imagesAsData: true });
    return finish(ctx, 'docx-to-html', files, opts, [outFile(opts.outputName || `${stem(file.name)}.html`, new TextEncoder().encode(html), OFFICE_MIME.html)], warnings);
  },
});

export const docxToTxt = officeTool({
  id: 'docx-to-txt',
  pack: 'office',
  category: 'office',
  title: { de: 'DOCX zu Text', en: 'DOCX to text' },
  description: { de: 'Reiner Text aus Word.', en: 'Plain text from Word.' },
  inputs: { accept: [OFFICE_MIME.docx, '.docx'], multiple: false, min: 1 },
  outputs: { mime: [MIME.txt] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['docx txt'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const { doc, warnings } = await docxIn(file);
    return finish(ctx, 'docx-to-txt', files, opts, [outFile(opts.outputName || `${stem(file.name)}.txt`, new TextEncoder().encode(docxToPlainText(doc)), MIME.txt)], warnings);
  },
});

export const markdownToDocx = officeTool({
  id: 'markdown-to-docx',
  pack: 'office',
  category: 'office',
  title: { de: 'Markdown zu DOCX', en: 'Markdown to DOCX' },
  description: { de: 'Markdown nach Word.', en: 'Markdown to Word.' },
  inputs: { accept: [MIME.md, '.md', '.markdown', MIME.txt], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.docx] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['markdown docx'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const doc = markdownToDoc(await firstText(file));
    return finish(ctx, 'markdown-to-docx', files, opts, [outFile(opts.outputName || `${stem(file.name)}.docx`, writeDocx(doc), OFFICE_MIME.docx)]);
  },
});

export const htmlToDocx = officeTool({
  id: 'html-to-docx',
  pack: 'office',
  category: 'office',
  title: { de: 'HTML zu DOCX', en: 'HTML to DOCX' },
  description: { de: 'HTML nach Word.', en: 'HTML to Word.' },
  inputs: { accept: [OFFICE_MIME.html, '.html', '.htm'], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.docx] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['html docx'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const doc = htmlToDoc(await firstText(file));
    return finish(ctx, 'html-to-docx', files, opts, [outFile(opts.outputName || `${stem(file.name)}.docx`, writeDocx(doc), OFFICE_MIME.docx)]);
  },
});

export const markdownToPdf = officeTool({
  id: 'markdown-to-pdf',
  pack: 'office',
  category: 'office',
  title: { de: 'Markdown zu PDF', en: 'Markdown to PDF' },
  description: { de: 'Markdown nach PDF (Themes, Titelseite, TOC, Code).', en: 'Markdown to PDF (themes, title page, TOC, code).' },
  inputs: { accept: [MIME.md, '.md', '.markdown', MIME.txt], multiple: false, min: 0 },
  outputs: { mime: [MIME.pdf] },
  options: pdfOpts.extend({ source: z.string().default(''), title: z.string().default('') }),
  presets: [
    { id: 'default', title: { de: 'Standard', en: 'Default' }, options: { theme: 'default' } },
    { id: 'github', title: { de: 'GitHub', en: 'GitHub' }, options: { theme: 'github' } },
    { id: 'academic', title: { de: 'Akademisch', en: 'Academic' }, options: { theme: 'academic', titlePage: true, toc: true } },
  ],
  ui: { editor: 'doc-preview' },
  licenses: [],
  seo: { keywords: ['markdown pdf'] },
  async run(ctx, files, opts) {
    const text = files[0] ? await firstText(files[0]) : opts.source;
    if (!text.trim()) throw new Error('Kein Markdown.');
    ctx.progress(0.3, 'layout');
    const doc = markdownToDoc(text, opts.title || undefined);
    doc.styles = { theme: opts.theme };
    const pdf = await renderDocToPdf(doc, { page: opts.page, theme: opts.theme, titlePage: opts.titlePage, toc: opts.toc, title: opts.title || doc.title });
    const name = opts.outputName || `${stem(files[0]?.name ?? 'document')}.pdf`;
    return finish(ctx, 'markdown-to-pdf', files, opts, [outFile(name, pdf.bytes, MIME.pdf)], pdf.warnings, { pages: pdf.pageCount });
  },
});

export const markdownToHtml = officeTool({
  id: 'markdown-to-html',
  pack: 'office',
  category: 'office',
  title: { de: 'Markdown zu HTML', en: 'Markdown to HTML' },
  description: { de: 'Standalone-HTML mit Theme-CSS und Code-Highlight.', en: 'Standalone HTML with theme CSS and code highlight.' },
  inputs: { accept: [MIME.md, '.md', '.markdown', MIME.txt], multiple: false, min: 0 },
  outputs: { mime: [OFFICE_MIME.html] },
  options: z.object({ theme: themeOpt, source: z.string().default(''), outputName: z.string().default('') }),
  ui: { editor: 'doc-preview' },
  licenses: [],
  seo: { keywords: ['markdown html'] },
  async run(ctx, files, opts) {
    const text = files[0] ? await firstText(files[0]) : opts.source;
    const doc = markdownToDoc(text);
    let html = docToHtml(doc, { standalone: true, theme: opts.theme });
    html = html.replace(/<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/g, (_m, lang: string, code: string) => {
      const decoded = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const hl = highlightCode(decoded, lang);
      return `<pre><code class="language-${hl.language ?? lang} hljs">${hl.html}</code></pre>`;
    });
    return finish(ctx, 'markdown-to-html', files, opts, [outFile(opts.outputName || `${stem(files[0]?.name ?? 'document')}.html`, new TextEncoder().encode(html), OFFICE_MIME.html)]);
  },
});

export const htmlToPdf = officeTool({
  id: 'html-to-pdf',
  pack: 'office',
  category: 'office',
  title: { de: 'HTML zu PDF', en: 'HTML to PDF' },
  description: { de: 'HTML-Datei oder eingefügter Code nach PDF (Layout, kein Raster).', en: 'HTML file or pasted code to PDF (layout, not a screenshot).' },
  inputs: { accept: [OFFICE_MIME.html, '.html', '.htm'], multiple: false, min: 0 },
  outputs: { mime: [MIME.pdf] },
  options: pdfOpts.extend({ source: z.string().default('') }),
  ui: { editor: 'doc-preview' },
  licenses: [],
  seo: { keywords: ['html pdf'] },
  async run(ctx, files, opts) {
    const html = files[0] ? await firstText(files[0]) : opts.source;
    if (!html.trim()) throw new Error('Kein HTML.');
    const doc = htmlToDoc(html);
    const pdf = await renderDocToPdf(doc, { page: opts.page, theme: opts.theme, titlePage: opts.titlePage, toc: opts.toc, title: doc.title });
    return finish(ctx, 'html-to-pdf', files, opts, [outFile(opts.outputName || `${stem(files[0]?.name ?? 'document')}.pdf`, pdf.bytes, MIME.pdf)], pdf.warnings, { pages: pdf.pageCount });
  },
});

export const textToPdf = officeTool({
  id: 'text-to-pdf',
  pack: 'office',
  category: 'office',
  title: { de: 'Text zu PDF', en: 'Text to PDF' },
  description: { de: 'Reiner Text nach PDF.', en: 'Plain text to PDF.' },
  inputs: { accept: [MIME.txt, '.txt'], multiple: false, min: 1 },
  outputs: { mime: [MIME.pdf] },
  options: z.object({ page: pageOpt, outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['text pdf'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const pdf = await renderPlainTextToPdf(await firstText(file), { page: opts.page, title: stem(file.name) });
    return finish(ctx, 'text-to-pdf', files, opts, [outFile(opts.outputName || `${stem(file.name)}.pdf`, pdf.bytes, MIME.pdf)], pdf.warnings);
  },
});
