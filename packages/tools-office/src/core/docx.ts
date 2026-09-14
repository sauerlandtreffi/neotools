import type { Doc, DocBlock, Heading, ListBlock, Run, TableBlock } from './model.js';
import { emptyDoc, runText } from './model.js';
import { findZip, putText, unzipBytes, zipBytes, zipText, type ZipMap } from '../util/zip.js';
import { asArray, attr, escapeXml, parseXml, textOf } from '../util/xml.js';
import { fromUtf8, toArrayBuffer, utf8 } from '../util/bytes.js';
import { htmlToDoc } from './html.js';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

function rec(node: unknown): Record<string, unknown> | undefined {
  return node && typeof node === 'object' ? (node as Record<string, unknown>) : undefined;
}

function headingFromStyle(styleId: string | undefined, styles: Map<string, string>): Heading['level'] | undefined {
  if (!styleId) return undefined;
  const name = (styles.get(styleId) ?? styleId).toLowerCase();
  const m = /heading\s*([1-6])|titel|title/.exec(name);
  if (m?.[1]) return Number(m[1]) as Heading['level'];
  if (name === 'title' || name === 'titel') return 1;
  return undefined;
}

function parseRuns(node: unknown, rels: Map<string, string>, media: ZipMap): Run[] {
  const runs: Run[] = [];
  const r = rec(node);
  if (!r) return runs;
  const hyperlink = r.hyperlink;
  if (hyperlink) {
    for (const h of asArray(hyperlink)) {
      const id = attr(h, 'id') ?? attr(h, 'r:id');
      const href = id ? rels.get(id) : undefined;
      for (const run of parseRuns(h, rels, media)) {
        runs.push({ ...run, href: href ?? run.href });
      }
    }
  }
  for (const runNode of asArray(r.r)) {
    const rr = rec(runNode);
    if (!rr) continue;
    const rPr = rec(rr.rPr);
    const style: Omit<Run, 'text'> = {
      bold: Boolean(rPr?.b || rPr?.bCs),
      italic: Boolean(rPr?.i || rPr?.iCs),
      underline: Boolean(rPr?.u),
      strike: Boolean(rPr?.strike || rPr?.dstrike),
    };
    if (rr.t != null) {
      const t = textOf(rr.t);
      if (t) runs.push({ text: t, ...style });
    }
    if (rr.br || rr.cr) runs.push({ text: '\n', ...style });
    if (rr.tab) runs.push({ text: '\t', ...style });
  }
  return runs;
}

function parseParagraph(node: unknown, styles: Map<string, string>, rels: Map<string, string>, media: ZipMap): DocBlock[] {
  const r = rec(node);
  if (!r) return [];
  const pPr = rec(r.pPr);
  const styleId = attr(rec(pPr?.pStyle), 'val');
  const pageBreak = Boolean(rec(pPr?.pageBreakBefore) || JSON.stringify(r).includes('"br"') && JSON.stringify(r).includes('page'));
  const blocks: DocBlock[] = [];
  if (pageBreak) blocks.push({ type: 'page-break' });
  const drawing = r.drawing ?? rec(r.r)?.drawing;
  if (drawing) {
    const json = JSON.stringify(drawing);
    const embed = /"@_embed":"([^"]+)"/.exec(json)?.[1] ?? /"@_r:embed":"([^"]+)"/.exec(json)?.[1];
    if (embed) {
      const target = rels.get(embed);
      if (target) {
        const path = target.startsWith('/') ? target.slice(1) : `word/${target.replace(/^\.\//, '')}`;
        const bytes = media[path] ?? media[`word/${target}`];
        blocks.push({ type: 'image', bytes, mime: path.endsWith('.png') ? 'image/png' : 'image/jpeg', alt: path });
      }
    }
  }
  const level = headingFromStyle(styleId, styles);
  const runs = parseRuns(node, rels, media);
  const numPr = rec(pPr?.numPr);
  if (numPr) {
    const ilvl = Number(attr(rec(numPr.ilvl), 'val') ?? '0');
    void ilvl;
    return [
      ...blocks,
      {
        type: 'list',
        ordered: (attr(rec(numPr.numId), 'val') ?? '1') !== '1' || true,
        items: [{ blocks: [{ type: 'paragraph', runs }] }],
      } satisfies ListBlock,
    ];
  }
  if (level) blocks.push({ type: 'heading', level, runs });
  else if (runs.length) blocks.push({ type: 'paragraph', runs });
  return blocks;
}

function parseTable(node: unknown, styles: Map<string, string>, rels: Map<string, string>, media: ZipMap): TableBlock {
  const rows: TableBlock['rows'] = [];
  for (const tr of asArray(rec(node)?.tr)) {
    const cells = asArray(rec(tr)?.tc).map((tc) => ({
      blocks: asArray(rec(tc)?.p).flatMap((p) => parseParagraph(p, styles, rels, media)),
    }));
    rows.push({ cells });
  }
  return { type: 'table', header: true, rows };
}

function parseStyles(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const root = rec(parseXml(xml));
  const styles = rec(root?.styles);
  for (const st of asArray(styles?.style)) {
    const id = attr(st, 'styleId');
    const name = attr(rec(rec(st)?.name), 'val') ?? id;
    if (id && name) map.set(id, name);
  }
  return map;
}

function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const root = rec(parseXml(xml));
  const rels = rec(root?.Relationships) ?? root;
  for (const rel of asArray(rels?.Relationship)) {
    const id = attr(rel, 'Id');
    const target = attr(rel, 'Target');
    if (id && target) map.set(id, target);
  }
  return map;
}

function mergeAdjacentLists(blocks: DocBlock[]): DocBlock[] {
  const out: DocBlock[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (b.type === 'list' && prev?.type === 'list' && prev.ordered === b.ordered) {
      prev.items.push(...b.items);
    } else out.push(b);
  }
  return out;
}

export function readDocx(bytes: Uint8Array): Doc {
  const zip = unzipBytes(bytes);
  const documentXml = zipText('word/document.xml', zip);
  if (!documentXml) throw new Error('DOCX ohne word/document.xml');
  const styles = parseStyles(zipText('word/styles.xml', zip));
  const rels = parseRels(zipText('word/_rels/document.xml.rels', zip));
  const media: ZipMap = {};
  for (const { name, bytes: b } of findZip(zip, (n) => n.startsWith('word/media/'))) media[name] = b;
  const root = rec(parseXml(documentXml));
  const document = rec(root?.document);
  const body = rec(document?.body);
  const blocks: DocBlock[] = [];
  const children = body ?? {};
  for (const p of asArray(children.p)) blocks.push(...parseParagraph(p, styles, rels, media));
  for (const tbl of asArray(children.tbl)) blocks.push(parseTable(tbl, styles, rels, media));
  // preserve document order: re-walk mixed children via regex order of <w:p / <w:tbl
  const ordered = orderBodyBlocks(documentXml, styles, rels, media);
  const header = zipText('word/header1.xml', zip);
  const footer = zipText('word/footer1.xml', zip);
  return emptyDoc({
    blocks: mergeAdjacentLists(ordered.length ? ordered : blocks),
    header: header ? textOf(parseXml(header)).trim() : undefined,
    footer: footer ? textOf(parseXml(footer)).trim() : undefined,
  });
}

function orderBodyBlocks(xml: string, styles: Map<string, string>, rels: Map<string, string>, media: ZipMap): DocBlock[] {
  const root = rec(parseXml(xml));
  const body = rec(rec(root?.document)?.body);
  if (!body) return [];
  // fast-xml-parser keeps sibling arrays separately; reconstruct via sequential parse of body keys is lossy.
  // Fall back to scanning the raw XML for top-level p/tbl.
  const blocks: DocBlock[] = [];
  const re = /<(?:w:)?(p|tbl)\b[\s\S]*?<\/(?:w:)?\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const slice = m[0]!;
    const parsed = rec(parseXml(`<body>${slice}</body>`))?.body;
    const node = rec(parsed);
    if (!node) continue;
    if (node.tbl) blocks.push(parseTable(node.tbl, styles, rels, media));
    else if (node.p) blocks.push(...parseParagraph(node.p, styles, rels, media));
  }
  return blocks;
}

export async function readDocxWithFallback(bytes: Uint8Array): Promise<{ doc: Doc; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const doc = readDocx(bytes);
    if (doc.blocks.length) return { doc, warnings };
    warnings.push('OOXML-Parser lieferte keine Blöcke, Fallback mammoth.');
  } catch (err) {
    warnings.push(`OOXML-Parser: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ arrayBuffer: toArrayBuffer(bytes) });
    return { doc: htmlToDoc(result.value), warnings };
  } catch (err) {
    warnings.push(`mammoth: ${err instanceof Error ? err.message : String(err)}`);
    return { doc: emptyDoc(), warnings };
  }
}

function rPrXml(run: Run): string {
  const parts: string[] = [];
  if (run.bold) parts.push('<w:b/>');
  if (run.italic) parts.push('<w:i/>');
  if (run.underline) parts.push('<w:u w:val="single"/>');
  if (run.strike) parts.push('<w:strike/>');
  return parts.length ? `<w:rPr>${parts.join('')}</w:rPr>` : '';
}

function runXml(run: Run, rels: string[]): string {
  const space = /^\s|\s$/.test(run.text) ? ' xml:space="preserve"' : '';
  const text = `<w:t${space}>${escapeXml(run.text)}</w:t>`;
  if (run.href) {
    const id = `rIdH${rels.length + 2}`;
    rels.push(
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(run.href)}" TargetMode="External"/>`,
    );
    return `<w:hyperlink r:id="${id}"><w:r>${rPrXml(run)}${text}</w:r></w:hyperlink>`;
  }
  return `<w:r>${rPrXml(run)}${text}</w:r>`;
}

function pStyle(style: string): string {
  return `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`;
}

function paragraphXml(runs: Run[], rels: string[], style?: string): string {
  return `<w:p>${style ? pStyle(style) : ''}${runs.map((r) => runXml(r, rels)).join('')}</w:p>`;
}

function blocksXml(blocks: DocBlock[], rels: string[], media: ZipMap, counters: { img: number; num: number }): string {
  let out = '';
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out += paragraphXml(block.runs, rels, `Heading${block.level}`);
        break;
      case 'paragraph':
        out += paragraphXml(block.runs, rels);
        break;
      case 'list':
        for (const item of block.items) {
          counters.num += 1;
          const inner = item.blocks
            .map((b) => {
              if (b.type === 'paragraph') return runText(b.runs);
              if (b.type === 'heading') return runText(b.runs);
              return '';
            })
            .join(' ');
          const numId = block.ordered ? '2' : '1';
          out += `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${escapeXml(inner)}</w:t></w:r></w:p>`;
        }
        break;
      case 'table': {
        const rows = block.rows
          .map((row) => {
            const cells = row.cells
              .map((c) => `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${blocksXml(c.blocks.length ? c.blocks : [{ type: 'paragraph', runs: [{ text: '' }] }], rels, media, counters)}</w:tc>`)
              .join('');
            return `<w:tr>${cells}</w:tr>`;
          })
          .join('');
        out += `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows}</w:tbl>`;
        break;
      }
      case 'image': {
        if (!block.bytes) break;
        counters.img += 1;
        const ext = (block.mime ?? '').includes('jpeg') || (block.mime ?? '').includes('jpg') ? 'jpeg' : 'png';
        const name = `image${counters.img}.${ext}`;
        media[`word/media/${name}`] = block.bytes;
        const rid = `rIdI${counters.img}`;
        rels.push(
          `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`,
        );
        const cx = String(Math.round((block.width ?? 240) * 9525));
        const cy = String(Math.round((block.height ?? 180) * 9525));
        out += `<w:p><w:r><w:drawing><wp:inline xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${counters.img}" name="${name}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill><pic:spPr><a:xfrm><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
        break;
      }
      case 'code':
        out += paragraphXml([{ text: block.text, code: true }], rels);
        break;
      case 'page-break':
        out += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
        break;
      case 'hr':
        out += `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>`;
        break;
    }
  }
  return out;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W_NS}">
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`;

const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W_NS}">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

export function writeDocx(doc: Doc): Uint8Array {
  const rels: string[] = [];
  const media: ZipMap = {};
  const counters = { img: 0, num: 0 };
  const body = blocksXml(doc.blocks, rels, media, counters);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}">
<w:body>
${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body>
</w:document>`;
  const relXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_REL}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${rels.join('\n')}
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Default Extension="jpg" ContentType="image/jpeg"/>
<Override PartName="/word/document.xml" ContentType="${CT}"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;
  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG_REL}">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const zip: ZipMap = {};
  putText(zip, '[Content_Types].xml', contentTypes);
  putText(zip, '_rels/.rels', pkgRels);
  putText(zip, 'word/document.xml', documentXml);
  putText(zip, 'word/styles.xml', STYLES_XML);
  putText(zip, 'word/numbering.xml', NUMBERING_XML);
  putText(zip, 'word/_rels/document.xml.rels', relXml);
  for (const [k, v] of Object.entries(media)) zip[k] = v;
  if (doc.title || doc.author) {
    putText(
      zip,
      'docProps/core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(doc.title ?? '')}</dc:title><dc:creator>${escapeXml(doc.author ?? '')}</dc:creator></cp:coreProperties>`,
    );
  }
  return zipBytes(zip);
}

export function docxToPlainText(doc: Doc): string {
  return doc.blocks
    .map((b) => {
      if (b.type === 'heading' || b.type === 'paragraph') return runText(b.runs);
      if (b.type === 'code') return b.text;
      if (b.type === 'list') return b.items.map((it) => it.blocks.map((x) => (x.type === 'paragraph' ? runText(x.runs) : '')).join(' ')).join('\n');
      if (b.type === 'table')
        return b.rows.map((r) => r.cells.map((c) => c.blocks.map((x) => (x.type === 'paragraph' ? runText(x.runs) : '')).join(' ')).join('\t')).join('\n');
      return '';
    })
    .filter(Boolean)
    .join('\n\n') + '\n';
}

void fromUtf8;
void utf8;
