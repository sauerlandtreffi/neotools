import type { NeoFile } from '@neotools/engine';
import { ChunkBuffer, fileChunks } from '../util/hashes.js';

export interface BytesCompareResult {
  a: { name: string; size: number };
  b: { name: string; size: number };
  identical: boolean;
  firstDiff?: number;
  lengthDiff: number;
  differingBlocks: number;
  blockSize: number;
  offsets: number[];
}

export async function compareFiles(
  a: NeoFile,
  b: NeoFile,
  opts: { blockSize?: number; maxOffsets?: number } = {},
): Promise<BytesCompareResult> {
  const blockSize = opts.blockSize ?? 4096;
  const maxOffsets = opts.maxOffsets ?? 64;
  const offsets: number[] = [];
  let firstDiff: number | undefined;
  let differingBlocks = 0;
  let offset = 0;
  const ba = new ChunkBuffer();
  const bb = new ChunkBuffer();

  const pull = async (gen: AsyncGenerator<Uint8Array>, buf: ChunkBuffer, leftover: Uint8Array[]) => {
    if (leftover.length) return leftover.shift()!;
    const { value, done } = await gen.next();
    if (done || !value) return undefined;
    const blocks = buf.push(value, blockSize);
    leftover.push(...blocks);
    return leftover.shift();
  };

  const ga = fileChunks(a, blockSize);
  const gb = fileChunks(b, blockSize);
  const la: Uint8Array[] = [];
  const lb: Uint8Array[] = [];

  for (;;) {
    let ca = await pull(ga, ba, la);
    let cb = await pull(gb, bb, lb);
    if (!ca && !cb) {
      const fa = ba.flush();
      const fb = bb.flush();
      if (!fa && !fb) break;
      ca = fa;
      cb = fb;
    }
    if (!ca && cb) {
      if (firstDiff === undefined) firstDiff = offset;
      differingBlocks += 1;
      if (offsets.length < maxOffsets) offsets.push(offset);
      offset += cb.length;
      continue;
    }
    if (ca && !cb) {
      if (firstDiff === undefined) firstDiff = offset;
      differingBlocks += 1;
      if (offsets.length < maxOffsets) offsets.push(offset);
      offset += ca.length;
      continue;
    }
    if (ca && cb) {
      const n = Math.min(ca.length, cb.length);
      let blockDiff = false;
      for (let i = 0; i < n; i++) {
        if (ca[i] !== cb[i]) {
          if (firstDiff === undefined) firstDiff = offset + i;
          blockDiff = true;
          break;
        }
      }
      if (ca.length !== cb.length) {
        if (firstDiff === undefined) firstDiff = offset + n;
        blockDiff = true;
      }
      if (blockDiff) {
        differingBlocks += 1;
        if (offsets.length < maxOffsets) offsets.push(offset);
      }
      offset += Math.max(ca.length, cb.length);
    }
  }

  return {
    a: { name: a.name, size: a.size },
    b: { name: b.name, size: b.size },
    identical: firstDiff === undefined && a.size === b.size,
    firstDiff,
    lengthDiff: a.size - b.size,
    differingBlocks,
    blockSize,
    offsets,
  };
}

export function compareMarkdown(r: BytesCompareResult, locale: 'de' | 'en'): string {
  const lines = [
    locale === 'de' ? '# Bytes-Vergleich\n' : '# Byte compare\n',
    `- **${r.a.name}** ${r.a.size} B`,
    `- **${r.b.name}** ${r.b.size} B`,
    `- **identical:** ${r.identical}`,
    `- **firstDiff:** ${r.firstDiff ?? '—'}`,
    `- **lengthDiff:** ${r.lengthDiff}`,
    `- **differingBlocks (${r.blockSize} B):** ${r.differingBlocks}`,
    `- **offsets:** ${r.offsets.length ? r.offsets.join(', ') : '—'}`,
  ];
  return lines.join('\n') + '\n';
}
