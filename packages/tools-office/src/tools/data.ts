import { z } from 'zod';
import { MIME, type NeoFile } from '@neotools/engine';
import { officeTool, finish, outFile, requireFile, firstText } from './common.js';
import { OFFICE_MIME } from '../mime.js';
import { cleanRecords, convertData, detectEncoding, sniffKind, utf8Bytes, type DataKind } from '../core/textdata.js';
import { mergeVCards, parseVCards, serializeVCard, vcardsFromOcrText } from '../core/vcard.js';
import { mergeIcs } from '../core/ics.js';
import { defaultOfficeFontBytes, specimenPdf, subsetFont } from '../core/font-subset.js';
import { encodeBarcode, itemsFromCsv, readBarcodesFromBytes, sheetPdf, type BarcodeKind } from '../core/qr.js';
import { notesToApkg, notesToCsv } from '../core/anki.js';
import { stem, utf8 } from '../util/bytes.js';
import { zipBytes, type ZipMap } from '../util/zip.js';

export const dataClean = officeTool({
  id: 'data-clean',
  pack: 'office',
  category: 'data',
  title: { de: 'Daten aufräumen', en: 'Clean data' },
  description: { de: 'CSV/JSON/YAML/XML: Encoding, Schema, Duplikate, Konvertieren.', en: 'CSV/JSON/YAML/XML: encoding, schema, duplicates, convert.' },
  inputs: { accept: [OFFICE_MIME.csv, MIME.json, OFFICE_MIME.yaml, OFFICE_MIME.xml, '.csv', '.json', '.yaml', '.yml', '.xml', MIME.txt], multiple: false, min: 1 },
  outputs: { mime: [OFFICE_MIME.csv, MIME.json, OFFICE_MIME.yaml, OFFICE_MIME.xml, MIME.txt] },
  options: z.object({
    to: z.enum(['same', 'csv', 'json', 'yaml', 'xml']).default('same'),
    dropEmptyColumns: z.boolean().default(true),
    dropDuplicates: z.boolean().default(true),
    outputName: z.string().default(''),
  }),
  licenses: [],
  seo: { keywords: ['csv clean', 'yaml xml'] },
  async run(ctx, files, opts) {
    const file = requireFile(files);
    const { text, encoding } = detectEncoding(await file.bytes());
    const kind = sniffKind(file.name, file.mime, text);
    const cleaned = cleanRecords(kind, text, { dropEmptyColumns: opts.dropEmptyColumns, dropDuplicates: opts.dropDuplicates });
    cleaned.report.encoding = encoding;
    const target = opts.to === 'same' ? kind : opts.to;
    const outText = target === kind ? cleaned.text : convertData(cleaned.data, target as DataKind);
    const ext = target === 'yaml' ? 'yaml' : target;
    const mime =
      target === 'csv' ? OFFICE_MIME.csv : target === 'json' ? MIME.json : target === 'xml' ? OFFICE_MIME.xml : OFFICE_MIME.yaml;
    return finish(
      ctx,
      'data-clean',
      files,
      opts,
      [
        outFile(opts.outputName || `${stem(file.name)}.${ext}`, utf8Bytes(outText), mime),
        outFile('schema-report.json', utf8Bytes(`${JSON.stringify(cleaned.report, null, 2)}\n`), MIME.json),
      ],
      cleaned.report.warnings,
    );
  },
});

export const vcardTools = officeTool({
  id: 'vcard-tools',
  pack: 'office',
  category: 'data',
  title: { de: 'vCard-Werkzeuge', en: 'vCard tools' },
  description: { de: 'Visitenkarte per OCR, mergen, Fotos behalten.', en: 'Business-card OCR, merge, keep photos.' },
  inputs: { accept: [OFFICE_MIME.vcf, '.vcf', '.vcard', MIME.png, MIME.jpeg, MIME.pdf, 'image/*'], multiple: true, min: 1 },
  outputs: { mime: [OFFICE_MIME.vcf, MIME.json] },
  options: z.object({ version: z.enum(['2.1', '3.0', '4.0']).default('3.0'), langs: z.string().default('deu+eng'), outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['vcard', 'visitenkarte'] },
  async run(ctx, files, opts) {
    const cards = [];
    const warnings: string[] = [];
    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.vcf') || lower.endsWith('.vcard') || file.mime.includes('vcard')) {
        cards.push(...parseVCards(await firstText(file)));
        continue;
      }
      try {
        const { recognizePage } = await import('@neotools/tools-pdf');
        const { decode } = await import('@neotools/tools-image');
        const img = await decode({ bytes: await file.bytes(), name: file.name, mime: file.mime });
        const ocr = await recognizePage({ data: img.data, width: img.width, height: img.height }, opts.langs.split(/[+,\s]+/).filter(Boolean), ctx);
        const text = ocr.words.map((w) => w.text).join(' ');
        cards.push(vcardsFromOcrText(text));
      } catch (err) {
        warnings.push(`${file.name}: OCR nicht möglich (${err instanceof Error ? err.message : String(err)})`);
      }
    }
    const merged = mergeVCards(cards).map((c) => ({ ...c, version: opts.version }));
    const body = merged.map(serializeVCard).join('\n');
    return finish(ctx, 'vcard-tools', files, opts, [
      outFile(opts.outputName || 'contacts.vcf', utf8(body), OFFICE_MIME.vcf),
      outFile('vcard-report.json', utf8(`${JSON.stringify({ count: merged.length, warnings }, null, 2)}\n`), MIME.json),
    ], warnings);
  },
});

export const icsMerge = officeTool({
  id: 'ics-merge',
  pack: 'office',
  category: 'data',
  title: { de: 'ICS mergen', en: 'Merge ICS' },
  description: { de: 'Kalender mergen, UID-Kollisionen, Zeitzonen, ICS+CSV.', en: 'Merge calendars, UID collisions, timezones, ICS+CSV.' },
  inputs: { accept: [OFFICE_MIME.ics, '.ics', '.ical'], multiple: true, min: 1 },
  outputs: { mime: [OFFICE_MIME.ics, OFFICE_MIME.csv] },
  options: z.object({ outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['ics merge'] },
  async run(ctx, files, opts) {
    const texts = [];
    for (const f of files) texts.push(await firstText(f));
    const merged = mergeIcs(texts);
    const warnings = merged.timezones.length ? [`Zeitzonen: ${merged.timezones.join(', ')}`] : [];
    return finish(ctx, 'ics-merge', files, opts, [
      outFile(opts.outputName || 'merged.ics', utf8(merged.ics), OFFICE_MIME.ics),
      outFile('events.csv', utf8(merged.csv), OFFICE_MIME.csv),
    ], warnings, { events: merged.events.length, collisions: merged.collisions });
  },
});

export const fontSubsetTool = officeTool({
  id: 'font-subset',
  pack: 'office',
  category: 'data',
  title: { de: 'Font-Subset', en: 'Font subset' },
  description: { de: 'TTF/OTF/WOFF/WOFF2 auf benutzte Zeichen, Specimen-PDF.', en: 'TTF/OTF/WOFF/WOFF2 to used characters, specimen PDF.' },
  inputs: { accept: [OFFICE_MIME.ttf, OFFICE_MIME.otf, OFFICE_MIME.woff, OFFICE_MIME.woff2, '.ttf', '.otf', '.woff', '.woff2', MIME.txt], multiple: true, min: 1 },
  outputs: { mime: [OFFICE_MIME.woff2, OFFICE_MIME.ttf, MIME.pdf] },
  options: z.object({ unicodeRange: z.string().default(''), format: z.enum(['keep', 'woff2', 'ttf']).default('keep'), outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['font subset', 'woff2'] },
  async run(ctx, files, opts) {
    let fontFile: NeoFile | undefined;
    let text = '';
    for (const f of files) {
      if (/\.(ttf|otf|woff2?)$/i.test(f.name)) fontFile = f;
      else text += await firstText(f);
    }
    const fontBytes = fontFile ? await fontFile.bytes() : await defaultOfficeFontBytes();
    if (!fontBytes) throw new Error('Keine Schriftdatei.');
    if (!text) text = 'ABCÄÖÜß0123456789';
    const format = opts.format === 'keep' ? undefined : opts.format;
    const result = await subsetFont(fontBytes, text, { format, name: fontFile?.name, unicodeRange: opts.unicodeRange || undefined });
    const ext = result.format;
    const specimen = await specimenPdf(text, result.bytes);
    return finish(ctx, 'font-subset', files, opts, [
      outFile(opts.outputName || `${stem(fontFile?.name ?? 'font')}.subset.${ext}`, result.bytes, ext === 'woff2' ? OFFICE_MIME.woff2 : OFFICE_MIME.ttf),
      outFile('specimen.pdf', specimen, MIME.pdf),
    ], result.warnings, { glyphs: result.glyphs, bytes: result.bytes.byteLength });
  },
});

export const qrBatch = officeTool({
  id: 'qr-batch',
  pack: 'office',
  category: 'data',
  title: { de: 'QR / Barcode-Stapel', en: 'QR / barcode batch' },
  description: { de: 'QR/Code128/EAN13/DataMatrix aus CSV; Lesen aus Bild/PDF.', en: 'QR/Code128/EAN13/DataMatrix from CSV; read from image/PDF.' },
  inputs: { accept: [OFFICE_MIME.csv, '.csv', MIME.png, MIME.jpeg, MIME.svg, MIME.pdf, MIME.txt], multiple: true, min: 1 },
  outputs: { mime: [MIME.png, MIME.svg, MIME.pdf, MIME.json] },
  options: z.object({
    kind: z.enum(['qr', 'code128', 'ean13', 'datamatrix']).default('qr'),
    format: z.enum(['png', 'svg', 'pdf']).default('png'),
    column: z.coerce.number().default(0),
    read: z.boolean().default(false),
    outputName: z.string().default(''),
  }),
  licenses: [],
  seo: { keywords: ['qr batch', 'barcode'] },
  async run(ctx, files, opts) {
    const warnings: string[] = [];
    if (opts.read || files.every((f) => /\.(png|jpe?g|webp|gif|pdf)$/i.test(f.name))) {
      const texts: string[] = [];
      for (const f of files) {
        const found = await readBarcodesFromBytes(await f.bytes());
        if (!found.length) warnings.push(`${f.name}: kein Code gelesen.`);
        texts.push(...found);
      }
      return finish(ctx, 'qr-batch', files, opts, [outFile('codes.json', utf8(`${JSON.stringify(texts, null, 2)}\n`), MIME.json)], warnings);
    }
    const csv = files.find((f) => /\.(csv|txt)$/i.test(f.name)) ?? files[0]!;
    const items = itemsFromCsv(await firstText(csv), opts.column);
    if (!items.length) throw new Error('Keine Codes in der CSV.');
    if (opts.format === 'pdf') {
      return finish(ctx, 'qr-batch', files, opts, [outFile(opts.outputName || 'codes.pdf', await sheetPdf(items, opts.kind as BarcodeKind), MIME.pdf)]);
    }
    if (items.length === 1) {
      const bytes = await encodeBarcode(opts.kind as BarcodeKind, items[0]!.text, opts.format);
      return finish(ctx, 'qr-batch', files, opts, [outFile(opts.outputName || `code.${opts.format}`, bytes, opts.format === 'svg' ? MIME.svg : MIME.png)]);
    }
    const zip: ZipMap = {};
    for (let i = 0; i < items.length; i++) {
      const bytes = await encodeBarcode(opts.kind as BarcodeKind, items[i]!.text, opts.format);
      zip[`${String(i + 1).padStart(3, '0')}-${safe(items[i]!.label ?? items[i]!.text)}.${opts.format}`] = bytes;
    }
    return finish(ctx, 'qr-batch', files, opts, [outFile(opts.outputName || 'codes.zip', zipBytes(zip), OFFICE_MIME.zip)]);
  },
});

export const ankiFromImages = officeTool({
  id: 'anki-from-images',
  pack: 'office',
  category: 'data',
  title: { de: 'Anki aus Bildern', en: 'Anki from images' },
  description: { de: 'Bild + OCR → Anki-CSV und .apkg-light.', en: 'Image + OCR → Anki CSV and .apkg-light.' },
  inputs: { accept: [MIME.png, MIME.jpeg, 'image/*', MIME.txt, MIME.md], multiple: true, min: 1 },
  outputs: { mime: [OFFICE_MIME.csv, OFFICE_MIME.apkg] },
  options: z.object({ langs: z.string().default('deu+eng'), outputName: z.string().default('') }),
  licenses: [],
  seo: { keywords: ['anki', 'apkg'] },
  async run(ctx, files, opts) {
    const notes = [];
    const warnings: string[] = [];
    for (const file of files) {
      if (/\.(txt|md)$/i.test(file.name)) {
        const lines = (await firstText(file)).split(/\n/).map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          const [front, back] = line.split(/\t|;|—|–|->/).map((s) => s.trim());
          if (front) notes.push({ front, back: back ?? '' });
        }
        continue;
      }
      try {
        const { recognizePage } = await import('@neotools/tools-pdf');
        const { decode } = await import('@neotools/tools-image');
        const img = await decode({ bytes: await file.bytes(), name: file.name, mime: file.mime });
        const ocr = await recognizePage({ data: img.data, width: img.width, height: img.height }, opts.langs.split(/[+,\s]+/).filter(Boolean), ctx);
        const text = ocr.words.map((w) => w.text).join(' ');
        notes.push({ front: `<img src="${file.name}" />`, back: text, imageName: file.name, image: await file.bytes() });
      } catch (err) {
        warnings.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        notes.push({ front: file.name, back: '', imageName: file.name, image: await file.bytes() });
      }
    }
    const outputs = [outFile(opts.outputName || 'anki.csv', utf8(notesToCsv(notes)), OFFICE_MIME.csv)];
    try {
      outputs.push(outFile('deck.apkg', await notesToApkg(notes), OFFICE_MIME.apkg));
    } catch (err) {
      warnings.push(`APKG: ${err instanceof Error ? err.message : String(err)}`);
    }
    return finish(ctx, 'anki-from-images', files, opts, outputs, warnings, { notes: notes.length });
  },
});

function safe(s: string): string {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'code';
}
