import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { Doc, DocBlock, Heading, ListItem, Paragraph, Run, TableBlock } from './model.js';
import { emptyDoc, runText } from './model.js';
import { escapeXml } from '../util/xml.js';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

function isEl(node: Node): node is Element {
  return node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType';
}

function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

function textContent(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  if (!isEl(node)) return '';
  return node.childNodes.map(textContent).join('');
}

function decodeDataUri(src: string): { bytes: Uint8Array; mime: string } | undefined {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(src);
  if (!m) return undefined;
  const mime = m[1] || 'application/octet-stream';
  const b64 = Boolean(m[2]);
  const data = decodeURIComponent(m[3] ?? '');
  if (b64) {
    const bin = typeof atob === 'function' ? atob(data) : Buffer.from(data, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime };
  }
  return { bytes: new TextEncoder().encode(data), mime };
}

function collectRuns(node: Node, style: Omit<Run, 'text'>): Run[] {
  if (node.nodeName === '#text') {
    const text = (node as DefaultTreeAdapterMap['textNode']).value;
    if (!text) return [];
    return [{ text, ...style }];
  }
  if (!isEl(node)) return [];
  const next: Omit<Run, 'text'> = { ...style };
  const name = node.nodeName.toLowerCase();
  if (name === 'strong' || name === 'b') next.bold = true;
  if (name === 'em' || name === 'i') next.italic = true;
  if (name === 'u') next.underline = true;
  if (name === 's' || name === 'del' || name === 'strike') next.strike = true;
  if (name === 'code') next.code = true;
  if (name === 'a') next.href = attr(node, 'href');
  const runs: Run[] = [];
  for (const child of node.childNodes) runs.push(...collectRuns(child, next));
  return runs;
}

function headingLevel(name: string): Heading['level'] | undefined {
  if (/^h[1-6]$/.test(name)) return Number(name[1]) as Heading['level'];
  return undefined;
}

function isBlock(name: string): boolean {
  return (
    ['p', 'div', 'section', 'article', 'main', 'header', 'footer', 'blockquote', 'pre', 'ul', 'ol', 'table', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(
      name,
    ) || name === 'img'
  );
}

function parseBlocks(nodes: Node[]): DocBlock[] {
  const blocks: DocBlock[] = [];
  const pending: Run[] = [];
  const flush = () => {
    const runs = pending.splice(0).filter((r) => r.text.length);
    if (!runs.length) return;
    if (!runs.some((r) => r.text.trim())) return;
    blocks.push({ type: 'paragraph', runs });
  };

  for (const node of nodes) {
    if (node.nodeName === '#text') {
      const text = (node as DefaultTreeAdapterMap['textNode']).value;
      if (text.trim()) pending.push({ text });
      continue;
    }
    if (!isEl(node)) continue;
    const name = node.nodeName.toLowerCase();
    const style = attr(node, 'style') ?? '';
    if (/page-break-(before|after)\s*:\s*always/i.test(style) || name === 'div' && (attr(node, 'class') ?? '').includes('page-break')) {
      flush();
      blocks.push({ type: 'page-break' });
    }
    const h = headingLevel(name);
    if (h) {
      flush();
      blocks.push({ type: 'heading', level: h, runs: collectRuns(node, {}) });
      continue;
    }
    if (name === 'p') {
      flush();
      const align = /text-align\s*:\s*(center|right|justify)/i.exec(style)?.[1] as Paragraph['align'] | undefined;
      blocks.push({ type: 'paragraph', runs: collectRuns(node, {}), align });
      continue;
    }
    if (name === 'pre') {
      flush();
      const codeEl = node.childNodes.find((c) => isEl(c) && c.nodeName.toLowerCase() === 'code');
      const langClass = codeEl && isEl(codeEl) ? (attr(codeEl, 'class') ?? '') : '';
      const lang = /language-([a-z0-9+-]+)/i.exec(langClass)?.[1];
      blocks.push({ type: 'code', language: lang, text: textContent(node).replace(/\n$/, '') });
      continue;
    }
    if (name === 'ul' || name === 'ol') {
      flush();
      const items: ListItem[] = [];
      for (const child of node.childNodes) {
        if (!isEl(child) || child.nodeName.toLowerCase() !== 'li') continue;
        const checkedAttr = attr(child, 'data-checked') ?? attr(child, 'checked');
        items.push({
          blocks: parseBlocks(child.childNodes),
          checked: checkedAttr === '' || checkedAttr === 'true' ? true : checkedAttr === 'false' ? false : undefined,
        });
      }
      blocks.push({ type: 'list', ordered: name === 'ol', items });
      continue;
    }
    if (name === 'table') {
      flush();
      blocks.push(parseTable(node));
      continue;
    }
    if (name === 'hr') {
      flush();
      blocks.push({ type: 'hr' });
      continue;
    }
    if (name === 'img') {
      flush();
      const src = attr(node, 'src') ?? '';
      const decoded = src.startsWith('data:') ? decodeDataUri(src) : undefined;
      blocks.push({
        type: 'image',
        alt: attr(node, 'alt'),
        href: src.startsWith('data:') ? undefined : src,
        bytes: decoded?.bytes,
        mime: decoded?.mime,
      });
      continue;
    }
    if (name === 'br') {
      pending.push({ text: '\n' });
      continue;
    }
    if (isBlock(name)) {
      flush();
      blocks.push(...parseBlocks(node.childNodes));
      continue;
    }
    pending.push(...collectRuns(node, {}));
  }
  flush();
  return blocks;
}

function parseTable(el: Element): TableBlock {
  const rows: TableBlock['rows'] = [];
  let header = false;
  const walk = (node: Node) => {
    if (!isEl(node)) return;
    const name = node.nodeName.toLowerCase();
    if (name === 'thead') header = true;
    if (name === 'tr') {
      rows.push({
        cells: node.childNodes
          .filter((c): c is Element => isEl(c) && (c.nodeName === 'td' || c.nodeName === 'th'))
          .map((c) => ({ blocks: parseBlocks(c.childNodes) })),
      });
      return;
    }
    for (const child of node.childNodes) walk(child);
  };
  walk(el);
  return { type: 'table', header, rows };
}

export function htmlToDoc(html: string, title?: string): Doc {
  const tree = parse(html);
  const htmlEl = tree.childNodes.find((n) => isEl(n) && n.nodeName === 'html') as Element | undefined;
  const body = htmlEl?.childNodes.find((n) => isEl(n) && n.nodeName === 'body') as Element | undefined;
  const head = htmlEl?.childNodes.find((n) => isEl(n) && n.nodeName === 'head') as Element | undefined;
  const titleEl = head?.childNodes.find((n) => isEl(n) && n.nodeName === 'title');
  const docTitle = title ?? (titleEl ? textContent(titleEl).trim() : undefined);
  const roots = body ? body.childNodes : tree.childNodes;
  return emptyDoc({ title: docTitle, blocks: parseBlocks(roots) });
}

function runsToHtml(runs: Run[]): string {
  return runs
    .map((r) => {
      let s = escapeXml(r.text);
      if (r.code) s = `<code>${s}</code>`;
      if (r.bold) s = `<strong>${s}</strong>`;
      if (r.italic) s = `<em>${s}</em>`;
      if (r.underline) s = `<u>${s}</u>`;
      if (r.strike) s = `<s>${s}</s>`;
      if (r.href) s = `<a href="${escapeXml(r.href)}">${s}</a>`;
      return s;
    })
    .join('');
}

function blocksToHtml(blocks: DocBlock[], imagesAsData: boolean): string {
  return blocks.map((b) => blockToHtml(b, imagesAsData)).join('\n');
}

function blockToHtml(block: DocBlock, imagesAsData: boolean): string {
  switch (block.type) {
    case 'heading':
      return `<h${block.level}>${runsToHtml(block.runs)}</h${block.level}>`;
    case 'paragraph':
      return `<p>${runsToHtml(block.runs)}</p>`;
    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul';
      const items = block.items
        .map((it) => {
          const chk =
            it.checked === undefined ? '' : ` data-checked="${it.checked ? 'true' : 'false'}"`;
          return `<li${chk}>${blocksToHtml(it.blocks, imagesAsData)}</li>`;
        })
        .join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'table': {
      const rows = block.rows
        .map((row, i) => {
          const tag = block.header && i === 0 ? 'th' : 'td';
          return `<tr>${row.cells.map((c) => `<${tag}>${blocksToHtml(c.blocks, imagesAsData)}</${tag}>`).join('')}</tr>`;
        })
        .join('');
      return `<table>${rows}</table>`;
    }
    case 'image': {
      let src = block.href ?? '';
      if (imagesAsData && block.bytes) {
        const b64 = btoa(Array.from(block.bytes, (x) => String.fromCharCode(x)).join(''));
        src = `data:${block.mime ?? 'image/png'};base64,${b64}`;
      }
      return `<img src="${escapeXml(src)}" alt="${escapeXml(block.alt ?? '')}" />`;
    }
    case 'code':
      return `<pre><code class="language-${escapeXml(block.language ?? '')}">${escapeXml(block.text)}</code></pre>`;
    case 'page-break':
      return `<div class="page-break" style="page-break-after:always"></div>`;
    case 'hr':
      return '<hr />';
  }
}

export function themeCss(theme: 'default' | 'github' | 'academic' = 'default'): string {
  const base = `
    body { font-family: "Source Sans 3", "Source Sans Pro", system-ui, sans-serif; line-height: 1.5; color: #1a1a1a; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; }
    h1,h2,h3,h4 { line-height: 1.25; }
    table { border-collapse: collapse; width: 100%; }
    th,td { border: 1px solid #ccc; padding: 0.35rem 0.5rem; }
    pre { background: #f4f4f4; padding: 0.75rem; overflow: auto; font-family: "Source Code Pro", ui-monospace, monospace; }
    code { font-family: "Source Code Pro", ui-monospace, monospace; }
    img { max-width: 100%; }
    .page-break { break-after: page; }
  `;
  if (theme === 'github') {
    return `${base} body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; } pre { background: #f6f8fa; } a { color: #0969da; }`;
  }
  if (theme === 'academic') {
    return `${base} body { font-family: "Source Serif 4", "Source Serif Pro", Georgia, serif; } h1,h2,h3 { font-family: "Source Sans 3", sans-serif; }`;
  }
  return base;
}

export function docToHtml(
  doc: Doc,
  options: { standalone?: boolean; theme?: 'default' | 'github' | 'academic'; imagesAsData?: boolean } = {},
): string {
  const body = blocksToHtml(doc.blocks, options.imagesAsData !== false);
  if (!options.standalone) return body;
  const title = escapeXml(doc.title ?? 'Document');
  const css = themeCss(options.theme ?? doc.styles?.theme ?? 'default');
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>${css}</style>
</head>
<body>
${doc.title ? `<header><h1 class="doc-title">${escapeXml(doc.title)}</h1></header>` : ''}
${body}
</body>
</html>
`;
}

export function highlightHtml(code: string, language?: string): string {
  try {
    // lazy; caller may already have highlighted
    return code;
  } finally {
    void language;
  }
}

export { runText };
