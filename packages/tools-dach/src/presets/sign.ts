import { sha512 } from '@noble/hashes/sha512';
import { hex } from '@neotools/engine';

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(rec[k])}`).join(',')}}`;
}

async function ed() {
  const mod = await import('@noble/ed25519');
  const hashes = (mod as { hashes?: { sha512?: typeof sha512 } }).hashes;
  if (hashes && !hashes.sha512) hashes.sha512 = sha512;
  const etc = (mod as { etc?: { sha512Sync?: (...m: Uint8Array[]) => Uint8Array; concatBytes: (...m: Uint8Array[]) => Uint8Array } }).etc;
  if (etc && !etc.sha512Sync) etc.sha512Sync = (...m: Uint8Array[]) => sha512(etc.concatBytes(...m));
  return mod;
}

export async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const cryptoObj = globalThis.crypto;
  const priv = new Uint8Array(32);
  cryptoObj.getRandomValues(priv);
  const e = await ed();
  const pub =
    typeof e.getPublicKeyAsync === 'function' ? await e.getPublicKeyAsync(priv) : await e.getPublicKey(priv);
  return { publicKey: hex(pub), privateKey: hex(priv) };
}

export async function signPresets(body: unknown, privateKeyHex: string): Promise<string> {
  const e = await ed();
  const msg = new TextEncoder().encode(canonical(body));
  const priv = hexToBytes(privateKeyHex);
  const sig = typeof e.signAsync === 'function' ? await e.signAsync(msg, priv) : await e.sign(msg, priv);
  return hex(sig);
}

export async function verifyPresets(body: unknown, signatureHex: string, publicKeyHex: string): Promise<boolean> {
  const e = await ed();
  const msg = new TextEncoder().encode(canonical(body));
  const sig = hexToBytes(signatureHex);
  const pub = hexToBytes(publicKeyHex);
  return typeof e.verifyAsync === 'function' ? e.verifyAsync(sig, msg, pub) : e.verify(sig, msg, pub);
}

function hexToBytes(h: string): Uint8Array {
  const clean = h.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export { canonical };
