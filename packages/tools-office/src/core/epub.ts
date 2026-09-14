import { findZip, putText, unzipBytes, zipBytes, zipText, type ZipMap } from '../util/zip.js';
import { asArray, attr, escapeXml, parseXml, textOf } from '../util/xml.js';
import { htmlToDoc, docToHtml } from './html.js';
import { markdownToDoc, docToMarkdown } from './markdown.js';
import type { Doc } from './model.js';
import { emptyDoc } from './model.js';
import { renderDocToPdf, type PdfRenderResult } from './pdf-render.js';
import { loadFace } from './fonts.js';
import { subsetFont } from './font-subset.js';

export interface EpubChapter {
  id: string;
  href: string;
  title: string;
  html: string;
  doc: Doc;
}

export interface EpubBook {
  title: string;
  creator?: string;
  language: string;
  chapters: EpubChapter[];
  images: Array<{ href: string; bytes: Uint8Array; mime: string }>;
  fonts: Array<{ href: string; bytes: Uint8Array }>;
  ncx?: string;
  nav?: string;
}

function rec(node: unknown): Record<string, unknown> | undefined {
  return node && typeof node === 'object' ? (node as Record<string, unknown>) : undefined;
}

export function readEpub(bytes: Uint8Array): EpubBook {
  const zip = unzipBytes(bytes);
  const container = zipText('META-INF/container.xml', zip);
  const root = rec(parseXml(container));
  const rf = rec(asArray(rec(rec(root?.container)?.rootfiles)?.rootfile)[0] ?? rec(root?.container)?.rootfile);
  const opfPath = attr(rf, 'full-path') ?? findZip(zip, (n) => n.endsWith('.opf'))[0]?.name;
  if (!opfPath) throw new Error('EPUB ohne OPF');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = rec(parseXml(zipText(opfPath, zip)));
  const pkg = rec(opf?.package) ?? opf;
  const meta = rec(pkg?.metadata);
  const title = textOf(meta?.title) || 'Untitled';
  const creator = textOf(meta?.creator) || undefined;
  const language = textOf(meta?.language) || 'de';
  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of asArray(rec(pkg?.manifest)?.item)) {
    const id = attr(item, 'id');
    const href = attr(item, 'href');
    const type = attr(item, 'media-type') ?? '';
    if (id && href) manifest.set(id, { href, type });
  }
  const spine = asArray(rec(pkg?.spine)?.itemref)
    .map((it) => attr(it, 'idref'))
    .filter((x): x is string => Boolean(x));
  const chapters: EpubChapter[] = [];
  const images: EpubBook['images'] = [];
  const fonts: EpubBook['fonts'] = [];
  for (const [id, item] of manifest) {
    const path = `${base}${item.href}`.replace(/\/+/g, '/');
    const data = zip[path] ?? zip[item.href];
    if (!data) continue;
    if (item.type.startsWith('image/')) images.push({ href: item.href, bytes: data, mime: item.type });
    if (item.type.startsWith('font/') || /\.(ttf|otf|woff2?)$/i.test(item.href)) fonts.push({ href: item.href, bytes: data });
    void id;
  }
  for (const id of spine) {
    const item = manifest.get(id);
    if (!item) continue;
    if (!/html|xml/.test(item.type) && !item.href.endsWith('.xhtml') && !item.href.endsWith('.html')) continue;
    const path = `${base}${item.href}`.replace(/\/+/g, '/');
    const html = zipText(path, zip);
    const doc = htmlToDoc(html);
    chapters.push({
      id,
      href: item.href,
      title: doc.title || doc.blocks.find((b) => b.type === 'heading')?.type === 'heading'
        ? (doc.blocks.find((b) => b.type === 'heading' && b.level === 1) as { runs: Array<{ text: string }> } | undefined)?.runs
            .map((r) => r.text)
            .join('') || item.href
        : item.href,
      html,
      doc,
    });
  }
  const ncxItem = [...manifest.values()].find((i) => i.type.includes('ncx') || i.href.endsWith('.ncx'));
  const navItem = [...manifest.values()].find((i) => i.href.includes('nav') && /html/.test(i.type));
  return {
    title,
    creator,
    language,
    chapters,
    images,
    fonts,
    ncx: ncxItem ? zipText(`${base}${ncxItem.href}`, zip) : undefined,
    nav: navItem ? zipText(`${base}${navItem.href}`, zip) : undefined,
  };
}

export function epubToDoc(book: EpubBook): Doc {
  const blocks = book.chapters.flatMap((ch, i) => [
    ...(i ? ([{ type: 'page-break' as const }] as const) : []),
    ...ch.doc.blocks,
  ]);
  return emptyDoc({ title: book.title, author: book.creator, blocks: [...blocks] });
}

export async function epubToPdf(book: EpubBook): Promise<PdfRenderResult> {
  return renderDocToPdf(epubToDoc(book), { theme: 'academic', header: book.title, toc: true });
}

export function epubToStandaloneHtml(book: EpubBook): string {
  const parts = book.chapters.map((ch) => `<section id="${escapeXml(ch.id)}">${docToHtml(ch.doc, { standalone: false })}</section>`);
  return docToHtml(
    { title: book.title, author: book.creator, blocks: [] },
    { standalone: true, theme: 'academic' },
  ).replace('</body>', `${parts.join('\n')}</body>`);
}

export interface EpubWriteOptions {
  title?: string;
  creator?: string;
  language?: string;
  cover?: { bytes: Uint8Array; mime: string };
  chapters: Array<{ title: string; doc?: Doc; markdown?: string; html?: string }>;
}

export async function writeEpub(options: EpubWriteOptions): Promise<Uint8Array> {
  const lang = options.language ?? 'de';
  const title = options.title ?? options.chapters[0]?.title ?? 'Buch';
  const creator = options.creator ?? '';
  const zip: ZipMap = {};
  putText(zip, 'mimetype', 'application/epub+zip');
  putText(
    zip,
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  const chapterFiles: Array<{ id: string; href: string; title: string; html: string }> = [];
  options.chapters.forEach((ch, i) => {
    const doc = ch.doc ?? (ch.markdown ? markdownToDoc(ch.markdown, ch.title) : htmlToDoc(ch.html ?? `<h1>${escapeXml(ch.title)}</h1>`));
    const html = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}"><head><title>${escapeXml(ch.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${docToHtml({ ...doc, title: ch.title }, { standalone: false })}</body></html>`;
    const href = `chap${String(i + 1).padStart(3, '0')}.xhtml`;
    chapterFiles.push({ id: `ch${i + 1}`, href, title: ch.title, html });
    putText(zip, `OEBPS/${href}`, html);
  });
  const sans = await loadFace('sans', 'regular');
  if (sans) {
    const used = options.chapters.map((c) => c.title).join('') + title;
    const subset = await subsetFont(sans.bytes, used, { format: 'woff2' }).catch(() => ({ bytes: sans.bytes, warnings: [] as string[] }));
    zip['OEBPS/fonts/SourceSans3.woff2'] = subset.bytes;
  }
  putText(
    zip,
    'OEBPS/style.css',
    `body{font-family:"Source Sans 3",serif;line-height:1.5}h1{font-size:1.6em}@font-face{font-family:"Source Sans 3";src:url(fonts/SourceSans3.woff2) format("woff2");}`,
  );
  let coverItem = '';
  if (options.cover) {
    const ext = options.cover.mime.includes('png') ? 'png' : 'jpg';
    zip[`OEBPS/cover.${ext}`] = options.cover.bytes;
    coverItem = `<item id="cover" href="cover.${ext}" media-type="${options.cover.mime}" properties="cover-image"/>`;
  }
  const manifest = chapterFiles
    .map((c) => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`)
    .join('');
  const spine = chapterFiles.map((c) => `<itemref idref="${c.id}"/>`).join('');
  const navLis = chapterFiles.map((c) => `<li><a href="${c.href}">${escapeXml(c.title)}</a></li>`).join('');
  putText(
    zip,
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Nav</title></head><body><nav epub:type="toc"><ol>${navLis}</ol></nav></body></html>`,
  );
  const ncxNav = chapterFiles
    .map((c, i) => `<navPoint id="${c.id}" playOrder="${i + 1}"><navLabel><text>${escapeXml(c.title)}</text></navLabel><content src="${c.href}"/></navPoint>`)
    .join('');
  putText(
    zip,
    'OEBPS/toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:neotools-epub"/></head><docTitle><text>${escapeXml(title)}</text></docTitle><navMap>${ncxNav}</navMap></ncx>`,
  );
  putText(
    zip,
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="3.0">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:neotools-epub-${Date.now()}</dc:identifier>
<dc:title>${escapeXml(title)}</dc:title>
<dc:creator>${escapeXml(creator)}</dc:creator>
<dc:language>${escapeXml(lang)}</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
</metadata>
<manifest>
${coverItem}
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${sans ? '<item id="font" href="fonts/SourceSans3.woff2" media-type="font/woff2"/>' : ''}
${manifest}
</manifest>
<spine toc="ncx">${spine}</spine>
</package>`,
  );
  return zipBytes(zip, ['mimetype']);
}

export function unpackReport(book: EpubBook): string {
  return [
    `# ${book.title}`,
    book.creator ? `Autor: ${book.creator}` : '',
    `Sprache: ${book.language}`,
    `Kapitel: ${book.chapters.length}`,
    `Bilder: ${book.images.length}`,
    `Fonts: ${book.fonts.length}`,
    '',
    ...book.chapters.map((c, i) => `${i + 1}. ${c.title} (${c.href})`),
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function chapterAsMarkdown(ch: EpubChapter): string {
  return docToMarkdown({ ...ch.doc, title: ch.title });
}

export async function fixEpubFonts(bytes: Uint8Array): Promise<{ bytes: Uint8Array; report: string }> {
  const zip = unzipBytes(bytes);
  const fonts = findZip(zip, (n) => /\.(ttf|otf|woff2?)$/i.test(n));
  const texts = findZip(zip, (n) => /\.(xhtml|html|htm|css)$/i.test(n))
    .map((f) => new TextDecoder().decode(f.bytes))
    .join('');
  const used = texts.replace(/<[^>]+>/g, '');
  let saved = 0;
  for (const f of fonts) {
    const next = await subsetFont(f.bytes, used, { format: guessFontFormat(f.name) });
    if (next.bytes.byteLength < f.bytes.byteLength) {
      saved += f.bytes.byteLength - next.bytes.byteLength;
      zip[f.name] = next.bytes;
    }
  }
  return { bytes: zipBytes(zip, ['mimetype']), report: `${fonts.length} Fonts, ${saved} Bytes gespart.` };
}

function guessFontFormat(name: string): 'ttf' | 'otf' | 'woff' | 'woff2' {
  if (name.endsWith('.woff2')) return 'woff2';
  if (name.endsWith('.woff')) return 'woff';
  if (name.endsWith('.otf')) return 'otf';
  return 'ttf';
}
