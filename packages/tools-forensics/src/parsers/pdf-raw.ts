import { findAllBytes, findBytes, latin1 } from '../util/bytes.js';

export interface PdfRawObject {
  id: string;
  offset: number;
  length: number;
  hasStream: boolean;
  filters: string[];
  dictPreview: string;
}

export interface PdfRawParse {
  version?: string;
  eofOffsets: number[];
  incrementalUpdates: number;
  bytesAfterLastEof: number;
  startxref: number[];
  linearized: boolean;
  encrypted: boolean;
  objects: PdfRawObject[];
  catalogHints: {
    javascript: boolean;
    embeddedFiles: boolean;
    openAction: boolean;
    launch: boolean;
    uri: boolean;
    ocg: boolean;
    aa: boolean;
  };
}

const PDF_EOF = [0x25, 0x25, 0x45, 0x4f, 0x46] as const;

export function parsePdfRaw(bytes: Uint8Array): PdfRawParse | undefined {
  if (findBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]) < 0) return undefined;
  const head = latin1(bytes, 0, 16);
  const vm = /%PDF-(\d\.\d)/.exec(head);
  const eofOffsets = findAllBytes(bytes, PDF_EOF, 32);
  let lastEnd = 0;
  if (eofOffsets.length) {
    const last = eofOffsets[eofOffsets.length - 1]!;
    lastEnd = last + 5;
    while (lastEnd < bytes.length && (bytes[lastEnd] === 10 || bytes[lastEnd] === 13 || bytes[lastEnd] === 32)) lastEnd += 1;
  }
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 4_000_000)));
  const startxref = [...text.matchAll(/startxref\s+(\d+)/g)].map((m) => Number(m[1]));
  const linearized = /\/Linearized/.test(text);
  const encrypted = /\/Encrypt[\s/]/.test(text);

  const objects: PdfRawObject[] = [];
  const objRe = /(\d+)\s+(\d+)\s+obj/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(text)) && objects.length < 400) {
    const start = m.index;
    const endRel = text.indexOf('endobj', start);
    const end = endRel >= 0 ? endRel + 6 : Math.min(text.length, start + 2000);
    const body = text.slice(start, end);
    const filters = [...body.matchAll(/\/Filter\s*\/([A-Za-z0-9]+)/g)].map((x) => x[1]!);
    if (/\/Filter\s*\[/.test(body)) {
      for (const f of body.match(/\/(FlateDecode|DCTDecode|ASCIIHexDecode|ASCII85Decode|LZWDecode|RunLengthDecode|CCITTFaxDecode|JBIG2Decode|JPXDecode)/g) ?? []) {
        filters.push(f.slice(1));
      }
    }
    objects.push({
      id: `${m[1]} ${m[2]}`,
      offset: start,
      length: end - start,
      hasStream: /stream/.test(body),
      filters: [...new Set(filters)],
      dictPreview: body.slice(0, 180).replace(/\s+/g, ' '),
    });
  }

  return {
    version: vm?.[1],
    eofOffsets,
    incrementalUpdates: Math.max(0, eofOffsets.length - 1),
    bytesAfterLastEof: Math.max(0, bytes.length - lastEnd),
    startxref,
    linearized,
    encrypted,
    objects,
    catalogHints: {
      javascript: /\/(JavaScript|JS)[\s/(]/.test(text),
      embeddedFiles: /\/EmbeddedFiles|\/AF\s/.test(text),
      openAction: /\/OpenAction/.test(text),
      launch: /\/S\s*\/Launch|\/Launch/.test(text),
      uri: /\/S\s*\/URI|\/URI\s*\(/.test(text),
      ocg: /\/OCProperties|\/OCG/.test(text),
      aa: /\/AA\s*<</.test(text),
    },
  };
}

export function appendIncrementalUpdate(
  pdf: Uint8Array,
  extra = '\n99 0 obj\n<< /Note (older generation recoverable) >>\nendobj\n%%EOF\n',
): Uint8Array {
  const add = new TextEncoder().encode(extra);
  const out = new Uint8Array(pdf.length + add.length);
  out.set(pdf);
  out.set(add, pdf.length);
  return out;
}
