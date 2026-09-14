import * as pkijs from 'pkijs';

let ready = false;

export function ensurePkiEngine(): void {
  if (ready) return;
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) throw new Error('WebCrypto fehlt (Node 19+ / Browser).');
  pkijs.setEngine(
    'webcrypto',
    new pkijs.CryptoEngine({ name: 'webcrypto', crypto: crypto as unknown as Crypto }),
  );
  ready = true;
}

export async function shaHex(alg: 'SHA-256' | 'SHA-512', data: Uint8Array): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(alg, data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export function concatRanges(bytes: Uint8Array, ranges: [number, number, number, number]): Uint8Array {
  const [a, b, c, d] = ranges;
  const out = new Uint8Array(b + d);
  out.set(bytes.subarray(a, a + b), 0);
  out.set(bytes.subarray(c, c + d), b);
  return out;
}
