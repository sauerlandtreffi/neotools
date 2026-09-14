import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { createToolContext, neoFileFromBytes, MIME } from '@neotools/engine';
import type { NeoFile, ToolContext } from '@neotools/engine';
import { PDFName } from 'pdf-lib';

export function ctx(): ToolContext {
  return createToolContext();
}

export async function makePdf(opts: {
  name?: string;
  pages?: number;
  text?: string;
  title?: string;
  author?: string;
  withOpenAction?: boolean;
}): Promise<NeoFile> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = opts.pages ?? 2;
  const text = opts.text ?? 'NeoTools';
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 300]);
    page.drawText(`${text} p${i + 1}`, {
      x: 40,
      y: 200,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
  }
  if (opts.title) doc.setTitle(opts.title);
  if (opts.author) doc.setAuthor(opts.author);
  if (opts.withOpenAction) {
    doc.catalog.set(
      PDFName.of('OpenAction'),
      doc.context.obj({
        Type: 'Action',
        S: 'JavaScript',
        JS: 'app.alert("x")',
      }),
    );
  }
  const bytes = await doc.save();
  return neoFileFromBytes(opts.name ?? 'sample.pdf', bytes, MIME.pdf);
}

export async function pageCount(file: NeoFile): Promise<number> {
  const doc = await PDFDocument.load(await file.bytes());
  return doc.getPageCount();
}

export async function tinyPng(): Promise<Uint8Array> {
  // 1x1 opaque red PNG
  const { PDFDocument: _ } = await import('pdf-lib');
  void _;
  const bin = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ),
    (c) => c.charCodeAt(0),
  );
  return bin;
}

export async function tinyJpg(): Promise<Uint8Array> {
  const hex =
    'ffd8ffe000104a46494600010100000100010000ffdb0043000302020302020303030304030304050805050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0b0b1016101113141515150c0f171816141812141514ffdb00430103040405040509050509140d0b0d1414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414ffc00011080002000203012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00f02a28a2bf323fb8cfffd9';
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
