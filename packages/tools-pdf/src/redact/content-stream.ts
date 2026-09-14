import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFPage,
  PDFRawStream,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib';
import type { RedactHit } from './types.js';
import { boxesOverlap } from './text-map.js';
import { normalizeWs } from './patterns.js';

const latin1 = new TextDecoder('latin1');
const latin1Enc = new TextEncoder();

export type Matrix = [number, number, number, number, number, number];

export function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function isWs(b: number): boolean {
  return b === 0x00 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d || b === 0x20;
}

function isDelim(b: number): boolean {
  return (
    b === 0x28 ||
    b === 0x29 ||
    b === 0x3c ||
    b === 0x3e ||
    b === 0x5b ||
    b === 0x5d ||
    b === 0x7b ||
    b === 0x7d ||
    b === 0x2f ||
    b === 0x25
  );
}

export type Token =
  | { kind: 'num'; value: number; raw: string }
  | { kind: 'str'; value: string }
  | { kind: 'hex'; value: string }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'lb' }
  | { kind: 'rb' }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'inline'; raw: Uint8Array };

function decodeLiteral(bytes: Uint8Array, start: number): { value: string; next: number } {
  let i = start + 1;
  let depth = 1;
  let out = '';
  while (i < bytes.length && depth > 0) {
    const b = bytes[i]!;
    if (b === 0x5c && i + 1 < bytes.length) {
      const n = bytes[i + 1]!;
      if (n >= 0x30 && n <= 0x37) {
        let oct = '';
        let j = i + 1;
        while (j < bytes.length && j < i + 4 && bytes[j]! >= 0x30 && bytes[j]! <= 0x37) {
          oct += String.fromCharCode(bytes[j]!);
          j += 1;
        }
        out += String.fromCharCode(parseInt(oct, 8) & 0xff);
        i = j;
        continue;
      }
      const map: Record<number, string> = {
        0x6e: '\n',
        0x72: '\r',
        0x74: '\t',
        0x62: '\b',
        0x66: '\f',
        0x28: '(',
        0x29: ')',
        0x5c: '\\',
      };
      out += map[n] ?? String.fromCharCode(n);
      i += 2;
      continue;
    }
    if (b === 0x28) depth += 1;
    if (b === 0x29) {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }
    out += String.fromCharCode(b);
    i += 1;
  }
  return { value: out, next: i };
}

function decodeHex(bytes: Uint8Array, start: number): { value: string; next: number } {
  let i = start + 1;
  let hex = '';
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (b === 0x3e) {
      i += 1;
      break;
    }
    if (!isWs(b)) hex += String.fromCharCode(b);
    i += 1;
  }
  if (hex.length % 2 === 1) hex += '0';
  let value = '';
  for (let k = 0; k < hex.length; k += 2) {
    value += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
  }
  return { value, next: i };
}

export function tokenizeContent(bytes: Uint8Array): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    if (isWs(b)) {
      i += 1;
      continue;
    }
    if (b === 0x25) {
      while (i < bytes.length && bytes[i] !== 0x0a && bytes[i] !== 0x0d) i += 1;
      continue;
    }
    if (b === 0x28) {
      const lit = decodeLiteral(bytes, i);
      tokens.push({ kind: 'str', value: lit.value });
      i = lit.next;
      continue;
    }
    if (b === 0x3c && bytes[i + 1] === 0x3c) {
      i += 2;
      continue;
    }
    if (b === 0x3e && bytes[i + 1] === 0x3e) {
      i += 2;
      continue;
    }
    if (b === 0x3c) {
      const hx = decodeHex(bytes, i);
      tokens.push({ kind: 'hex', value: hx.value });
      i = hx.next;
      continue;
    }
    if (b === 0x5b) {
      tokens.push({ kind: 'lb' });
      i += 1;
      continue;
    }
    if (b === 0x5d) {
      tokens.push({ kind: 'rb' });
      i += 1;
      continue;
    }
    if (b === 0x2f) {
      i += 1;
      let name = '';
      while (i < bytes.length && !isWs(bytes[i]!) && !isDelim(bytes[i]!)) {
        if (bytes[i] === 0x23 && i + 2 < bytes.length) {
          name += String.fromCharCode(parseInt(latin1.decode(bytes.slice(i + 1, i + 3)), 16));
          i += 3;
        } else {
          name += String.fromCharCode(bytes[i]!);
          i += 1;
        }
      }
      tokens.push({ kind: 'name', value: name });
      continue;
    }
    if ((b >= 0x30 && b <= 0x39) || b === 0x2b || b === 0x2d || b === 0x2e) {
      const start = i;
      if (b === 0x2b || b === 0x2d) i += 1;
      while (i < bytes.length && ((bytes[i]! >= 0x30 && bytes[i]! <= 0x39) || bytes[i] === 0x2e)) i += 1;
      const raw = latin1.decode(bytes.subarray(start, i));
      tokens.push({ kind: 'num', value: Number(raw), raw });
      continue;
    }
    const start = i;
    while (i < bytes.length && !isWs(bytes[i]!) && !isDelim(bytes[i]!)) i += 1;
    const word = latin1.decode(bytes.subarray(start, i));
    if (word === 'true') tokens.push({ kind: 'bool', value: true });
    else if (word === 'false') tokens.push({ kind: 'bool', value: false });
    else if (word === 'null') tokens.push({ kind: 'null' });
    else if (word === 'BI') {
      const idAt = indexOfWord(bytes, i, 'ID');
      const eiAt = indexOfWord(bytes, idAt < 0 ? i : idAt, 'EI');
      const end = eiAt < 0 ? bytes.length : eiAt + 2;
      tokens.push({ kind: 'inline', raw: bytes.slice(start, end) });
      i = end;
    } else tokens.push({ kind: 'op', value: word });
  }
  return tokens;
}

function indexOfWord(bytes: Uint8Array, from: number, word: string): number {
  const w = latin1Enc.encode(word);
  for (let i = from; i <= bytes.length - w.length; i++) {
    let ok = true;
    for (let j = 0; j < w.length; j++) if (bytes[i + j] !== w[j]) { ok = false; break; }
    if (!ok) continue;
    const before = i === 0 || isWs(bytes[i - 1]!) || isDelim(bytes[i - 1]!);
    const after = i + w.length >= bytes.length || isWs(bytes[i + w.length]!) || isDelim(bytes[i + w.length]!);
    if (before && after) return i;
  }
  return -1;
}

function encodePdfString(value: string): string {
  let out = '(';
  for (const ch of value) {
    if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else out += ch;
  }
  out += ')';
  return out;
}

function encodeHex(value: string): string {
  let hex = '<';
  for (let i = 0; i < value.length; i++) {
    hex += value.charCodeAt(i).toString(16).padStart(2, '0');
  }
  hex += '>';
  return hex;
}

function serializeToken(t: Token): string {
  switch (t.kind) {
    case 'num':
      return t.raw;
    case 'str':
      return encodePdfString(t.value);
    case 'hex':
      return encodeHex(t.value);
    case 'name':
      return `/${t.value}`;
    case 'op':
      return t.value;
    case 'lb':
      return '[';
    case 'rb':
      return ']';
    case 'bool':
      return t.value ? 'true' : 'false';
    case 'null':
      return 'null';
    case 'inline':
      return latin1.decode(t.raw);
  }
}

export function serializeTokens(tokens: Token[]): Uint8Array {
  const parts: string[] = [];
  for (const t of tokens) {
    parts.push(serializeToken(t));
  }
  return latin1Enc.encode(parts.join(' '));
}

function asString(t: Token | undefined): string | null {
  if (!t) return null;
  if (t.kind === 'str' || t.kind === 'hex') return t.value;
  return null;
}

function blankToken(t: Token): Token {
  if (t.kind === 'str') return { kind: 'str', value: '' };
  if (t.kind === 'hex') return { kind: 'hex', value: '' };
  return t;
}

function shouldBlank(text: string, needles: string[]): boolean {
  if (!text) return false;
  const compact = normalizeWs(text);
  if (!compact) return false;
  for (const n of needles) {
    const c = normalizeWs(n);
    if (c.length >= 3 && (compact.includes(c) || c.includes(compact))) return true;
  }
  return false;
}

function blankInside(text: string, needles: string[]): string {
  let next = text;
  for (const n of needles) {
    if (!n) continue;
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    next = next.replace(re, '');
    const compactNeedle = n.replace(/\s+/g, '');
    if (compactNeedle.length >= 4) {
      const loose = compactNeedle.split('').join('\\s*');
      next = next.replace(new RegExp(loose, 'gi'), '');
    }
  }
  return next;
}

export interface RewriteResult {
  bytes: Uint8Array;
  blanked: number;
  hard: boolean;
  imageDos: Array<{ name: string; x: number; y: number; w: number; h: number }>;
}

export function rewriteTokens(
  tokens: Token[],
  needles: string[],
  boxes: Array<{ x: number; y: number; w: number; h: number }>,
): RewriteResult {
  let ctm: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  let inText = false;
  let tm: Matrix = IDENTITY;
  let fontSize = 12;
  let charSpacing = 0;
  let wordSpacing = 0;
  let horizScale = 1;
  let renderMode = 0;
  let blanked = 0;
  let hard = false;
  const imageDos: RewriteResult['imageDos'] = [];
  const out = tokens.slice();

  const textWidth = (text: string) =>
    Math.max(text.length * fontSize * 0.45 * horizScale + text.length * charSpacing + (text.split(' ').length - 1) * wordSpacing, 2);

  const markText = (text: string, idx: number, widthHint: number) => {
    const [x, y] = apply(mul(tm, ctm), 0, 0);
    const w = Math.max(widthHint, text.length * fontSize * 0.45);
    const h = fontSize;
    const box = { x, y, w, h };
    const overlap = boxes.some((b) => boxesOverlap(box, b, 3));
    const byText = shouldBlank(text, needles);
    if (overlap || byText) {
      const cleaned = blankInside(out[idx] && (out[idx]!.kind === 'str' || out[idx]!.kind === 'hex') ? (out[idx] as { value: string }).value : text, needles);
      if (out[idx] && (out[idx]!.kind === 'str' || out[idx]!.kind === 'hex')) {
        if (overlap && !byText) {
          out[idx] = blankToken(out[idx]!);
        } else {
          out[idx] = out[idx]!.kind === 'hex' ? { kind: 'hex', value: cleaned } : { kind: 'str', value: cleaned };
        }
        blanked += 1;
      }
    }
  };

  for (let i = 0; i < out.length; i++) {
    const t = out[i]!;
    if (t.kind !== 'op') continue;
    const op = t.value;
    if (op === 'q') stack.push(ctm);
    else if (op === 'Q') ctm = stack.pop() ?? IDENTITY;
    else if (op === 'cm') {
      const a = numAt(out, i, 6);
      if (a) ctm = mul(a, ctm);
    } else if (op === 'BT') {
      inText = true;
      tm = IDENTITY;
    } else if (op === 'ET') inText = false;
    else if (op === 'Tm') {
      const a = numAt(out, i, 6);
      if (a) tm = a;
    } else if (op === 'Td' || op === 'TD') {
      const n = nums(out, i, 2);
      if (n) tm = mul([1, 0, 0, 1, n[0]!, n[1]!], tm);
    } else if (op === 'T*') {
      tm = mul([1, 0, 0, 1, 0, -fontSize], tm);
    } else if (op === 'Tf') {
      const size = out[i - 1];
      if (size?.kind === 'num') fontSize = size.value;
    } else if (op === 'Tc') {
      const n = out[i - 1];
      if (n?.kind === 'num') charSpacing = n.value;
    } else if (op === 'Tw') {
      const n = out[i - 1];
      if (n?.kind === 'num') wordSpacing = n.value;
    } else if (op === 'Tz') {
      const n = out[i - 1];
      if (n?.kind === 'num') horizScale = n.value / 100;
    } else if (op === 'Ts') {
      // rise — position only; needles still match
    } else if (op === 'Tr') {
      const n = out[i - 1];
      if (n?.kind === 'num') {
        renderMode = n.value;
        // 4–7 clip the path; glyphs stay in the stream and must be blanked + raster-checked
        if (renderMode >= 4) hard = true;
      }
    } else if (op === 'Tj' || op === "'" || op === '"') {
      if (op === "'") tm = mul([1, 0, 0, 1, 0, -fontSize], tm);
      const offset = op === '"' ? 3 : 1;
      const sTok = out[i - offset];
      const text = asString(sTok);
      if (text !== null) markText(text, i - offset, textWidth(text));
      else hard = true;
    } else if (op === 'TJ') {
      let j = i - 1;
      const parts: number[] = [];
      if (out[j]?.kind === 'rb') {
        j -= 1;
        while (j >= 0 && out[j]?.kind !== 'lb') {
          if (out[j]!.kind === 'str' || out[j]!.kind === 'hex') parts.push(j);
          j -= 1;
        }
      }
      parts.reverse();
      const joined = parts.map((p) => asString(out[p]) ?? '').join('');
      const joinHit = shouldBlank(joined, needles);
      for (const p of parts) {
        const text = asString(out[p]) ?? '';
        markText(text, p, textWidth(text) || textWidth(joined));
        if (joinHit && out[p] && (out[p]!.kind === 'str' || out[p]!.kind === 'hex')) {
          out[p] = blankToken(out[p]!);
          blanked += 1;
        }
      }
    } else if (op === 'Do') {
      const name = out[i - 1];
      if (name?.kind === 'name') {
        const [x, y] = apply(ctm, 0, 0);
        const [x1, y1] = apply(ctm, 1, 1);
        imageDos.push({
          name: name.value,
          x: Math.min(x, x1),
          y: Math.min(y, y1),
          w: Math.abs(x1 - x),
          h: Math.abs(y1 - y),
        });
      }
    } else if (op === 'd0' || op === 'd1') {
      hard = true;
    }
    void inText;
  }

  return { bytes: serializeTokens(out), blanked, hard, imageDos };
}

function nums(tokens: Token[], opIndex: number, count: number): number[] | null {
  const out: number[] = [];
  for (let k = count; k >= 1; k--) {
    const t = tokens[opIndex - k];
    if (t?.kind !== 'num') return null;
    out.push(t.value);
  }
  return out;
}

function numAt(tokens: Token[], opIndex: number, count: number): Matrix | null {
  const n = nums(tokens, opIndex, count);
  if (!n || n.length !== 6) return null;
  return [n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!];
}

export function decodeStreamBytes(obj: unknown): Uint8Array {
  if (obj instanceof PDFRawStream) {
    try {
      return decodePDFRawStream(obj).decode();
    } catch {
      return obj.getContents();
    }
  }
  if (obj && typeof obj === 'object' && 'getUnencodedContents' in obj) {
    return (obj as { getUnencodedContents(): Uint8Array }).getUnencodedContents();
  }
  if (obj instanceof PDFStream) return obj.getContents();
  return new Uint8Array();
}

export function pageContentBytes(page: PDFPage): Uint8Array {
  const contents = page.node.Contents();
  if (!contents) return new Uint8Array();
  if (contents instanceof PDFArray) {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < contents.size(); i++) {
      parts.push(decodeStreamBytes(contents.lookup(i)));
    }
    const total = parts.reduce((n, p) => n + p.length + 1, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
      out[o] = 0x0a;
      o += 1;
    }
    return out;
  }
  return decodeStreamBytes(contents);
}

export function setPageContents(page: PDFPage, bytes: Uint8Array): void {
  const stream = page.doc.context.flateStream(bytes);
  page.node.set(PDFName.of('Contents'), page.doc.context.register(stream));
}

function rewriteXObjectForms(
  doc: PDFDocument,
  resources: PDFDict | undefined,
  needles: string[],
  boxes: Array<{ x: number; y: number; w: number; h: number }>,
  seen: Set<PDFDict>,
): { blanked: number; hard: boolean } {
  let blanked = 0;
  let hard = false;
  if (!resources || seen.has(resources)) return { blanked, hard };
  seen.add(resources);
  const xobj = resources.lookupMaybe(PDFName.of('XObject'), PDFDict);
  if (!xobj) return { blanked, hard };
  for (const key of xobj.keys()) {
    const child = xobj.lookup(key);
    const stream = child instanceof PDFRawStream || child instanceof PDFStream ? child : null;
    if (!stream) continue;
    const subtype = stream.dict.lookup(PDFName.of('Subtype'));
    if (!(subtype instanceof PDFName) || subtype.toString() !== '/Form') continue;
    const inner = decodeStreamBytes(stream);
    const rewritten = rewriteTokens(tokenizeContent(inner), needles, boxes);
    blanked += rewritten.blanked;
    hard = hard || rewritten.hard;
    const fresh = doc.context.flateStream(rewritten.bytes, copyStreamDict(stream.dict));
    xobj.set(key, doc.context.register(fresh));
    const innerRes = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    const nested = rewriteXObjectForms(doc, innerRes, needles, boxes, seen);
    blanked += nested.blanked;
    hard = hard || nested.hard;
    if (hasType3Font(innerRes)) hard = true;
  }
  return { blanked, hard };
}

function hasType3Font(resources: PDFDict | undefined): boolean {
  if (!resources) return false;
  const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) return false;
  for (const key of fonts.keys()) {
    const font = fonts.lookup(key);
    const dict = font instanceof PDFDict ? font : font && typeof font === 'object' && 'dict' in font ? (font as { dict: PDFDict }).dict : undefined;
    const subtype = dict?.lookup(PDFName.of('Subtype'));
    if (subtype instanceof PDFName && subtype.toString() === '/Type3') return true;
  }
  return false;
}

function rewriteAppearanceDict(
  doc: PDFDocument,
  dict: PDFDict | undefined,
  needles: string[],
  boxes: Array<{ x: number; y: number; w: number; h: number }>,
): { blanked: number; hard: boolean } {
  let blanked = 0;
  let hard = false;
  if (!dict) return { blanked, hard };
  for (const key of dict.keys()) {
    const child = dict.lookup(key);
    if (child instanceof PDFDict) {
      const inner = rewriteAppearanceDict(doc, child, needles, boxes);
      blanked += inner.blanked;
      hard = hard || inner.hard;
      continue;
    }
    const stream = child instanceof PDFRawStream || child instanceof PDFStream ? child : null;
    if (!stream) continue;
    const inner = decodeStreamBytes(stream);
    const rewritten = rewriteTokens(tokenizeContent(inner), needles, boxes);
    blanked += rewritten.blanked;
    hard = hard || rewritten.hard;
    const fresh = doc.context.flateStream(rewritten.bytes, copyStreamDict(stream.dict));
    dict.set(key, doc.context.register(fresh));
    const innerRes = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict);
    const nested = rewriteXObjectForms(doc, innerRes, needles, boxes, new Set());
    blanked += nested.blanked;
    hard = hard || nested.hard || hasType3Font(innerRes);
  }
  return { blanked, hard };
}

const STREAM_CODING_KEYS = new Set(['/Length', '/Filter', '/DecodeParms', '/DL']);

/** Keep BBox/Matrix/Resources/Subtype/FormType/Group… but drop encoding keys (flateStream sets its own). */
function copyStreamDict(src: PDFDict): Parameters<PDFDocument['context']['flateStream']>[1] {
  const out: Record<string, PDFObject> = {};
  for (const key of src.keys()) {
    const name = key.toString();
    if (STREAM_CODING_KEYS.has(name)) continue;
    const value = src.get(key);
    if (value) out[name.replace(/^\//, '')] = value;
  }
  return out;
}

export function rewriteAnnotationAppearances(
  page: PDFPage,
  needles: string[],
  boxes: Array<{ x: number; y: number; w: number; h: number }>,
): { blanked: number; hard: boolean } {
  let blanked = 0;
  let hard = false;
  const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) return { blanked, hard };
  for (let i = 0; i < annots.size(); i++) {
    const annot = annots.lookup(i);
    if (!(annot instanceof PDFDict)) continue;
    const ap = annot.lookupMaybe(PDFName.of('AP'), PDFDict);
    const next = rewriteAppearanceDict(page.doc, ap, needles, boxes);
    blanked += next.blanked;
    hard = hard || next.hard;
  }
  return { blanked, hard };
}

export function rewritePageContent(
  page: PDFPage,
  hits: RedactHit[],
  pageNumber: number,
): { blanked: number; hard: boolean; imageDos: RewriteResult['imageDos'] } {
  const pageHits = hits.filter((h) => h.page === pageNumber);
  const needles = pageHits.map((h) => h.text).filter((t) => t.trim().length >= 2);
  // zero-size boxes come from metadata/annotation hits — they only drive string blanking
  const boxes = pageHits.filter((h) => h.w > 0 && h.h > 0).map((h) => ({ x: h.x, y: h.y, w: h.w, h: h.h }));
  const bytes = pageContentBytes(page);
  const rewritten = rewriteTokens(tokenizeContent(bytes), needles, boxes);
  setPageContents(page, rewritten.bytes);
  const resources = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict);
  const forms = rewriteXObjectForms(page.doc, resources, needles, boxes, new Set());
  const apps = rewriteAnnotationAppearances(page, needles, boxes);
  const type3 = hasType3Font(resources);
  return {
    blanked: rewritten.blanked + forms.blanked + apps.blanked,
    hard: rewritten.hard || forms.hard || apps.hard || type3,
    imageDos: rewritten.imageDos,
  };
}

export function blankNeedlesInBytes(bytes: Uint8Array, needles: string[]): { bytes: Uint8Array; count: number } {
  const tokens = tokenizeContent(bytes);
  const rewritten = rewriteTokens(tokens, needles, []);
  return { bytes: rewritten.bytes, count: rewritten.blanked };
}
