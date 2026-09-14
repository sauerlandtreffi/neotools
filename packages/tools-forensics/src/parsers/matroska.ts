import { eqAt, latin1 } from '../util/bytes.js';

export interface EbmlNode {
  id: string;
  name: string;
  offset: number;
  size: number;
  value?: string | number;
  children?: EbmlNode[];
}

export interface MatroskaAutopsy {
  docType?: string;
  version?: number;
  nodes: EbmlNode[];
}

const NAMES: Record<number, string> = {
  0x1a45dfa3: 'EBML',
  0x18538067: 'Segment',
  0x4282: 'DocType',
  0x4286: 'EBMLVersion',
  0x4287: 'DocTypeVersion',
  0x1549a966: 'Info',
  0x1654ae6b: 'Tracks',
  0x1c53bb6b: 'Cues',
  0x114d9b74: 'SeekHead',
  0x1043a770: 'Chapters',
  0x1254c367: 'Tags',
  0x1941a469: 'Attachments',
  0x1f43b675: 'Cluster',
  0xae: 'TrackEntry',
  0xd7: 'TrackNumber',
  0x83: 'TrackType',
  0x86: 'CodecID',
  0x2ad7b1: 'TimestampScale',
  0x4489: 'Duration',
};

function readVint(bytes: Uint8Array, offset: number): { value: number; width: number } | undefined {
  if (offset >= bytes.length) return undefined;
  const first = bytes[offset]!;
  let width = 1;
  let mask = 0x80;
  while (width <= 8 && (first & mask) === 0) {
    width += 1;
    mask >>= 1;
  }
  if (width > 8 || offset + width > bytes.length) return undefined;
  let value = first & (mask - 1);
  for (let i = 1; i < width; i++) value = value * 256 + bytes[offset + i]!;
  return { value, width };
}

function readId(bytes: Uint8Array, offset: number): { id: number; width: number } | undefined {
  if (offset >= bytes.length) return undefined;
  const first = bytes[offset]!;
  let width = 1;
  let mask = 0x80;
  while (width <= 4 && (first & mask) === 0) {
    width += 1;
    mask >>= 1;
  }
  if (width > 4 || offset + width > bytes.length) return undefined;
  let id = 0;
  for (let i = 0; i < width; i++) id = (id << 8) | bytes[offset + i]!;
  return { id, width };
}

const CONTAINERS = new Set([
  0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0x114d9b74, 0x1043a770, 0x1254c367, 0x1941a469, 0xae,
]);

function parseNodes(bytes: Uint8Array, start: number, end: number, depth: number): EbmlNode[] {
  const nodes: EbmlNode[] = [];
  let i = start;
  while (i + 2 <= end && nodes.length < 80) {
    const idr = readId(bytes, i);
    if (!idr) break;
    const sz = readVint(bytes, i + idr.width);
    if (!sz) break;
    const dataStart = i + idr.width + sz.width;
    const dataEnd = Math.min(end, dataStart + sz.value);
    const name = NAMES[idr.id] ?? `0x${idr.id.toString(16)}`;
    const node: EbmlNode = {
      id: `0x${idr.id.toString(16)}`,
      name,
      offset: i,
      size: dataEnd - i,
    };
    if (CONTAINERS.has(idr.id) && depth < 5) {
      node.children = parseNodes(bytes, dataStart, dataEnd, depth + 1);
    } else if (idr.id === 0x4282) {
      node.value = latin1(bytes, dataStart, Math.min(32, dataEnd - dataStart)).replace(/\0/g, '');
    } else if (sz.value <= 8 && sz.value > 0) {
      let n = 0;
      for (let k = dataStart; k < dataEnd; k++) n = n * 256 + bytes[k]!;
      node.value = n;
    }
    nodes.push(node);
    if (dataEnd <= i) break;
    i = dataEnd;
    if (idr.id === 0x18538067 && depth === 0) {
      // Segment can be huge; children already limited
    }
  }
  return nodes;
}

export function parseMatroska(bytes: Uint8Array): MatroskaAutopsy | undefined {
  if (!eqAt(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) return undefined;
  const nodes = parseNodes(bytes, 0, Math.min(bytes.length, 1_000_000), 0);
  let docType: string | undefined;
  const walk = (list: EbmlNode[]) => {
    for (const n of list) {
      if (n.name === 'DocType' && typeof n.value === 'string') docType = n.value;
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  if (docType === 'webm') {
    const ebml = nodes[0];
    if (ebml) ebml.name = 'EBML (WebM)';
  }
  return { docType, nodes };
}
