import { blake3 } from '@noble/hashes/blake3';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { hex } from './bytes.js';
import type { NeoFile } from '@neotools/engine';

export type HashAlg = 'sha256' | 'sha512' | 'blake3';

export const HASH_ALGS: readonly HashAlg[] = ['sha256', 'sha512', 'blake3'];

export function hashBytes(alg: HashAlg, data: Uint8Array): string {
  if (alg === 'sha256') return hex(sha256(data));
  if (alg === 'sha512') return hex(sha512(data));
  return hex(blake3(data));
}

export function hashAll(data: Uint8Array): { sha256: string; sha512: string; blake3: string } {
  return {
    sha256: hashBytes('sha256', data),
    sha512: hashBytes('sha512', data),
    blake3: hashBytes('blake3', data),
  };
}

export async function hashFile(alg: HashAlg, file: NeoFile): Promise<string> {
  if (typeof file.stream === 'function' && file.size > 1_048_576) {
    const h =
      alg === 'sha256' ? sha256.create() : alg === 'sha512' ? sha512.create() : blake3.create();
    const reader = file.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) h.update(value);
      }
    } finally {
      reader.releaseLock();
    }
    return hex(h.digest());
  }
  return hashBytes(alg, await file.bytes());
}

export async function* fileChunks(file: NeoFile, blockSize = 65536): AsyncGenerator<Uint8Array> {
  if (typeof file.stream === 'function') {
    const reader = file.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.length) yield value;
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  const bytes = await file.bytes();
  if (!bytes.length) return;
  for (let i = 0; i < bytes.length; i += blockSize) {
    yield bytes.subarray(i, Math.min(i + blockSize, bytes.length));
  }
}

export class ChunkBuffer {
  private leftover = new Uint8Array(0);

  push(chunk: Uint8Array, block: number): Uint8Array[] {
    const out: Uint8Array[] = [];
    const merged = this.leftover.length
      ? (() => {
          const n = new Uint8Array(this.leftover.length + chunk.length);
          n.set(this.leftover);
          n.set(chunk, this.leftover.length);
          return n;
        })()
      : chunk;
    let i = 0;
    while (i + block <= merged.length) {
      out.push(merged.subarray(i, i + block));
      i += block;
    }
    this.leftover = i < merged.length ? new Uint8Array(merged.subarray(i)) : new Uint8Array(0);
    return out;
  }

  flush(): Uint8Array | undefined {
    if (!this.leftover.length) return undefined;
    const last = this.leftover;
    this.leftover = new Uint8Array(0);
    return last;
  }
}
