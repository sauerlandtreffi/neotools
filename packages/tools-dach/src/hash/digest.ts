export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy.buffer;
}

export async function digestHex(alg: 'SHA-256' | 'SHA-512', data: Uint8Array): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(alg, toArrayBuffer(data));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
