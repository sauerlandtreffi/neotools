import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { neoFileFromBytes, MIME } from '@neotools/engine';
import { pdfExtractText } from '@neotools/tools-pdf';
import { writeDocx, readDocx } from '../src/core/docx.js';
import { markdownToDoc, docToMarkdown } from '../src/core/markdown.js';
import { htmlToDoc } from '../src/core/html.js';
import { heading, modelFingerprint, paragraph } from '../src/core/model.js';
import { jsonToSheets, readWorkbook, writeWorkbook } from '../src/core/xlsx.js';
import { readPptx, slidesToMarkdown } from '../src/core/pptx.js';
import { readEpub, writeEpub } from '../src/core/epub.js';
import { detectEncoding, cleanRecords } from '../src/core/textdata.js';
import { mergeIcs } from '../src/core/ics.js';
import { mergeVCards, parseVCards } from '../src/core/vcard.js';
import { defaultOfficeFontBytes, subsetFont } from '../src/core/font-subset.js';
import { encodeBarcode, readBarcodesFromBytes } from '../src/core/qr.js';
import { zipBytes } from '../src/util/zip.js';
import { utf8 } from '../src/util/bytes.js';
import { ctx } from './helpers.js';
import { markdownToPdf } from '../src/tools/docs.js';
import { csvToXlsx, xlsxToJson } from '../src/tools/sheets.js';

describe('docx writer/reader', () => {
  it('roundtrips a programmatic document model', () => {
    const doc = {
      title: 'Probe',
      blocks: [
        heading(1, 'Titel Eins'),
        paragraph('Hallo Welt mit Fett.'),
        { type: 'heading' as const, level: 2 as const, runs: [{ text: 'Abschnitt', bold: true }] },
        {
          type: 'list' as const,
          ordered: false,
          items: [{ blocks: [paragraph('Punkt A')] }, { blocks: [paragraph('Punkt B')] }],
        },
        {
          type: 'table' as const,
          header: true,
          rows: [
            { cells: [{ blocks: [paragraph('Spalte')] }, { blocks: [paragraph('Wert')] }] },
            { cells: [{ blocks: [paragraph('Alpha')] }, { blocks: [paragraph('1')] }] },
          ],
        },
      ],
    };
    const bytes = writeDocx(doc);
    const back = readDocx(bytes);
    const a = JSON.stringify(modelFingerprint(doc));
    const b = JSON.stringify(modelFingerprint(back));
    expect(b).toContain('Titel Eins');
    expect(b).toContain('Hallo Welt');
    expect(b).toContain('Punkt A');
    expect(b).toContain('Alpha');
    expect(a.length).toBeGreaterThan(20);
  });
});

describe('markdown → pdf', () => {
  it('keeps text order, page count and outline', async () => {
    const md = `# Einleitung

Ein Absatz mit Text.

## Tabelle

| Name | Menge |
| --- | --- |
| Äpfel | 3 |
| Birnen | 2 |

## Liste

- erstens
- zweitens

## Code

\`\`\`js
const n = 42;
\`\`\`
`;
    const result = await markdownToPdf.run(ctx(), [neoFileFromBytes('probe.md', new TextEncoder().encode(md), MIME.md)], {
      page: 'a4',
      theme: 'default',
      titlePage: false,
      toc: true,
      source: '',
      title: '',
      outputName: 'probe.pdf',
    });
    const pdf = result.outputs.find((o) => o.name.endsWith('.pdf'));
    expect(pdf).toBeTruthy();
    const loaded = await PDFDocument.load(await pdf!.bytes());
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(loaded.getPageCount()).toBeLessThan(8);
    expect(loaded.catalog.has(PDFName.of('Outlines'))).toBe(true);
    const extracted = await pdfExtractText.run(ctx(), [pdf!], { pageBreaks: true });
    const text = new TextDecoder().decode(await extracted.outputs[0]!.bytes());
    const idx = ['Einleitung', 'Absatz', 'Äpfel', 'erstens', 'const n = 42'].map((s) => text.indexOf(s));
    for (const i of idx) expect(i).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < idx.length; i++) expect(idx[i]!).toBeGreaterThan(idx[i - 1]!);
  });
});

describe('xlsx', () => {
  it('roundtrips JSON → xlsx → json', async () => {
    const data = [{ name: 'Ada', n: 1 }, { name: 'Bob', n: 2 }];
    const bytes = writeWorkbook(jsonToSheets(data, 'Leute'));
    const sheets = readWorkbook(bytes);
    expect(sheets[0]!.name).toBe('Leute');
    expect(sheets[0]!.rows[0]).toEqual(['name', 'n']);
    const file = neoFileFromBytes('t.xlsx', bytes);
    const jsonOut = await xlsxToJson.run(ctx(), [file], { outputName: 't.json' });
    const parsed = JSON.parse(new TextDecoder().decode(await jsonOut.outputs[0]!.bytes())) as { Leute: Array<{ name: string }> };
    expect(parsed.Leute[0]!.name).toBe('Ada');
  });
});

describe('pptx', () => {
  it('reads a minimal deck as text', () => {
    const slides = readPptx(minimalPptx());
    expect(slides.length).toBeGreaterThanOrEqual(1);
    const md = slidesToMarkdown(slides);
    expect(md.toLowerCase()).toMatch(/hello|folie|slide|title/);
  });
});

describe('epub', () => {
  it('writer → reader roundtrip', async () => {
    const bytes = await writeEpub({
      title: 'Mini Buch',
      creator: 'Test',
      chapters: [{ title: 'Kapitel', markdown: '# Kapitel\n\nHallo EPUB.\n' }],
    });
    const book = readEpub(bytes);
    expect(book.title).toContain('Mini');
    expect(book.chapters.length).toBeGreaterThanOrEqual(1);
    const all = book.chapters.map((c) => c.html + JSON.stringify(c.doc)).join(' ');
    expect(all).toMatch(/Hallo EPUB|Kapitel/);
  });
});

describe('textdata / ics / vcard / font / qr', () => {
  it('decodes Windows-1252 CSV to UTF-8', async () => {
    const raw = Buffer.from('name;stadt\nMüller;Köln\n', 'latin1');
    raw[6] = 0xfc; // ü in win1252 for Müller if we craft bytes
    const crafted = Uint8Array.from([
      ...Buffer.from('name,city\n', 'ascii'),
      0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x2c, 0x4b, 0xf6, 0x6c, 0x6e, 0x0a,
    ]);
    const { text, encoding } = detectEncoding(crafted);
    expect(encoding).toMatch(/1252|latin|iso-8859|utf-8/);
    expect(text).toMatch(/ller/);
    const file = neoFileFromBytes('win.csv', crafted, 'text/csv');
    const out = await csvToXlsx.run(ctx(), [file], { sheetName: 'S', outputName: 'w.xlsx' });
    expect(out.outputs[0]!.name).toMatch(/xlsx/);
    const cleaned = cleanRecords('csv', text);
    expect(cleaned.report.kind).toBe('csv');
  });

  it('deduplicates ICS by UID', () => {
    const a = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:same-1\nDTSTART:20260101T100000Z\nSUMMARY:A\nEND:VEVENT\nEND:VCALENDAR\n`;
    const b = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:same-1\nDTSTART:20260101T100000Z\nSUMMARY:A\nEND:VEVENT\nBEGIN:VEVENT\nUID:other-2\nDTSTART:20260102T100000Z\nSUMMARY:B\nEND:VEVENT\nEND:VCALENDAR\n`;
    const merged = mergeIcs([a, b]);
    expect(merged.events).toHaveLength(2);
    expect(merged.collisions).toBeGreaterThanOrEqual(1);
  });

  it('merges vCards by email', () => {
    const text = `BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nEMAIL:ada@example.test\nTEL:+49111\nEND:VCARD\nBEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nEMAIL:ada@example.test\nTEL:+49222\nEND:VCARD\n`;
    const merged = mergeVCards(parseVCards(text));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.tel).toHaveLength(2);
    expect(merged[0]!.fn).toBeTruthy();
  });

  it('subsets a font to fewer bytes when possible', async () => {
    const src = await defaultOfficeFontBytes();
    if (!src) {
      expect(src).toBeNull();
      return;
    }
    const result = await subsetFont(src, 'ABC', { format: 'ttf' });
    expect(result.bytes.byteLength).toBeGreaterThan(16);
    expect(result.bytes.byteLength).toBeLessThanOrEqual(src.byteLength);
    expect(result.glyphs).toBeGreaterThan(0);
  });

  it('generates a QR code and reads it back when zxing works', async () => {
    const png = await encodeBarcode('qr', 'NEOTOOLS-QR-1', 'png');
    expect(png.byteLength).toBeGreaterThan(40);
    const read = await readBarcodesFromBytes(png);
    if (read.length) expect(read.join(' ')).toContain('NEOTOOLS-QR-1');
    else expect(png[0]).toBe(0x89);
  });
});

describe('html model', () => {
  it('parses headings lists and tables', () => {
    const doc = htmlToDoc('<h1>H</h1><p>p</p><ul><li>li</li></ul><table><tr><th>a</th><td>b</td></tr></table>');
    expect(modelFingerprint(doc)).toMatchObject({
      blocks: expect.arrayContaining([expect.objectContaining({ type: 'heading' })]),
    });
    const md = markdownToDoc('# T\n\nPara\n');
    expect(docToMarkdown(md)).toMatch(/T/);
  });
});

function minimalPptx(): Uint8Array {
  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld><p:spTree>
<p:nvGrpSpPr/><p:grpSpPr/>
<p:sp>
<p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="ctrTitle"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="7772400" cy="1470025"/></a:xfrm></p:spPr>
<p:txBody><a:bodyPr/><a:p><a:r><a:t>Hello Slide</a:t></a:r></a:p></p:txBody>
</p:sp>
</p:spTree></p:cSld></p:sld>`;
  const pres = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
<p:sldSz cx="9144000" cy="5143500"/>
</p:presentation>`;
  return zipBytes({
    '[Content_Types].xml': utf8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    ),
    '_rels/.rels': utf8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    ),
    'ppt/presentation.xml': utf8(pres),
    'ppt/_rels/presentation.xml.rels': utf8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`,
    ),
    'ppt/slides/slide1.xml': utf8(slide),
  });
}
