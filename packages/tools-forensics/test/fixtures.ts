import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib';
import { neoFileFromBytes } from '@neotools/engine';
import type { NeoFile } from '@neotools/engine';
import { concatBytes, utf8 } from '../src/util/bytes.js';
import { buildStoreZip } from '../src/parsers/zip.js';
import { buildMinimalMp4 } from '../src/parsers/isobmff.js';
import { buildId3Mp3 } from '../src/parsers/mp3.js';
import { buildMinimalWav } from '../src/parsers/riff.js';
import { buildExifApp1 } from '../src/parsers/tiff.js';
import { injectJpegSegment } from '../src/parsers/jpeg.js';
import { appendIncrementalUpdate } from '../src/parsers/pdf-raw.js';

export function tinyPng(): Uint8Array {
  return Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0),
  );
}

export function tinyJpg(): Uint8Array {
  const hex =
    'ffd8ffe000104a46494600010100000100010000ffdb0043000302020302020303030304030304050805050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0b0b1016101113141515150c0f171816141812141514ffdb00430103040405040509050509140d0b0d1414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414141414ffc00011080002000203012200021101031101ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102040403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae2e3e4e5e6e7e8e9eaf2f3f4f5f6f7f8f9faffda000c03010002110311003f00f02a28a2bf323fb8cfffd9';
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function jpegWithZip(): Uint8Array {
  return concatBytes(tinyJpg(), buildStoreZip({ 'hidden.txt': 'payload-not-extracted' }));
}

export function jpegWithExif(): Uint8Array {
  return injectJpegSegment(tinyJpg(), buildExifApp1({ software: 'NeoCam 1.0', gps: { lat: 52.5, lon: 13.4 } }));
}

export function pngAfterIend(): Uint8Array {
  return concatBytes(tinyPng(), utf8('AFTER-IEND-SECRET'));
}

export function peStub(): Uint8Array {
  const pe = new Uint8Array(256);
  pe[0] = 0x4d;
  pe[1] = 0x5a;
  pe[0x3c] = 0x80;
  pe[0x80] = 0x50;
  pe[0x81] = 0x45;
  pe[0x82] = 0x00;
  pe[0x83] = 0x00;
  pe[0x84] = 0x4c;
  pe[0x85] = 0x01;
  return pe;
}

export function htmlAsJpg(): Uint8Array {
  return utf8('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');
}

export function utf8BomText(): Uint8Array {
  return concatBytes(new Uint8Array([0xef, 0xbb, 0xbf]), utf8('Hallo NeoTools'));
}

export function minimalDocx(): Uint8Array {
  return buildStoreZip({
    '[Content_Types].xml':
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    'word/document.xml':
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:ins w:author="Ada"><w:r><w:t>ins</w:t></w:r></w:ins><w:del w:author="Bea"><w:r><w:delText>old</w:delText></w:r></w:del></w:body></w:document>',
    'docProps/core.xml':
      '<?xml version="1.0"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:creator>Ada Lovelace</dc:creator><cp:lastModifiedBy>Bea</cp:lastModifiedBy><cp:revision>7</cp:revision><dc:title>Secret</dc:title></cp:coreProperties>',
    'docProps/app.xml':
      '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Company>Neo GmbH</Company><TotalTime>42</TotalTime><Application>Word</Application></Properties>',
    'word/comments.xml':
      '<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="0"><w:p><w:r><w:t>internal note</w:t></w:r></w:p></w:comment></w:comments>',
    'word/_rels/document.xml.rels':
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="https://evil.example/x" TargetMode="External"/></Relationships>',
    'word/embeddings/oleObject1.bin': 'OLE',
    'word/vbaProject.bin': 'MACRO',
  });
}

export async function dirtyPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText('CONFIDENTIAL', {
    x: 40,
    y: 140,
    size: 36,
    font,
    rotate: degrees(40),
    opacity: 0.35,
    color: rgb(0.6, 0.6, 0.6),
  });
  page.drawText('Visible', { x: 40, y: 40, size: 12, font });
  doc.setAuthor('Hidden Author');
  doc.setProducer('NeoProducer');
  doc.setCreator('NeoCreator');
  doc.addJavaScript('main', 'app.alert("x")');
  await doc.attach(utf8('secret.txt contents'), 'secret.txt', { mimeType: 'text/plain' });
  doc.catalog.set(
    PDFName.of('OpenAction'),
    doc.context.obj({ Type: 'Action', S: 'JavaScript', JS: 'app.alert("oa")' }),
  );
  const bytes = await doc.save();
  return appendIncrementalUpdate(bytes);
}

export function hiddenTextPdf(): Uint8Array {
  const body = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 68 >> stream
BT /F1 12 Tf 3 Tr 40 100 Td (hidden-secret) Tj 0 Tr 40 80 Td (visible) Tj ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000062 00000 n 
0000000121 00000 n 
0000000278 00000 n 
0000000400 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
470
%%EOF
`;
  return utf8(body.replace(/\n/g, '\r\n'));
}

export function fileOf(name: string, data: Uint8Array, mime?: string): NeoFile {
  return neoFileFromBytes(name, data, mime);
}

export { buildMinimalMp4, buildId3Mp3, buildMinimalWav, buildStoreZip };
