export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa(bin)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(padded + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(padded + pad, 'base64'));
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, '');
  if (clean.length % 2 !== 0) throw new Error('Ungültiges Hex.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function parsePublicKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Public Key fehlt.');
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 64) return hexToBytes(trimmed);
  return base64UrlToBytes(trimmed);
}

export function parsePrivateKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Private Key fehlt.');
  if (/^[0-9a-fA-F]+$/.test(trimmed) && (trimmed.length === 64 || trimmed.length === 128)) {
    return hexToBytes(trimmed.slice(0, 64));
  }
  const bytes = base64UrlToBytes(trimmed);
  return bytes.length > 32 ? bytes.slice(0, 32) : bytes;
}
