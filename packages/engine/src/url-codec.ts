/** URL-safe Base64 helpers for option hashes (`?o=`) and pipeline fragments. */

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = globalThis.btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const bin = globalThis.atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeJsonBase64Url(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

export function decodeJsonBase64Url<T = unknown>(value: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T;
}
