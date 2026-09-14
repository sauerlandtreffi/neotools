import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex } from './codec.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export async function randomPrivateKey(): Promise<Uint8Array> {
  return ed.utils.randomPrivateKey();
}

export async function getPublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  return ed.getPublicKeyAsync(privateKey);
}

export async function signBytes(message: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
  return ed.signAsync(message, privateKey);
}

async function verifyNoble(sig: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
  try {
    return await ed.verifyAsync(sig, message, publicKey);
  } catch {
    return false;
  }
}

async function verifyWebCrypto(sig: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const pub = publicKey.slice();
    const sigCopy = sig.slice();
    const msgCopy = message.slice();
    const key = await subtle.importKey(
      'raw',
      pub.buffer.slice(pub.byteOffset, pub.byteOffset + pub.byteLength) as ArrayBuffer,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await subtle.verify(
      { name: 'Ed25519' },
      key,
      sigCopy.buffer.slice(sigCopy.byteOffset, sigCopy.byteOffset + sigCopy.byteLength) as ArrayBuffer,
      msgCopy.buffer.slice(msgCopy.byteOffset, msgCopy.byteOffset + msgCopy.byteLength) as ArrayBuffer,
    );
  } catch {
    return null;
  }
}

/** @noble/ed25519 is the source of truth (WebCrypto Ed25519 is not consistent across runtimes). */
export async function verifyBytes(sig: Uint8Array, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
  const noble = await verifyNoble(sig, message, publicKey);
  if (noble) return true;
  if (typeof process !== 'undefined' && process.versions?.node) return false;
  const web = await verifyWebCrypto(sig, message, publicKey);
  return web === true;
}

export async function generateKeypair(): Promise<{ privateKeyHex: string; publicKeyHex: string }> {
  const privateKey = await randomPrivateKey();
  const publicKey = await getPublicKey(privateKey);
  return { privateKeyHex: bytesToHex(privateKey), publicKeyHex: bytesToHex(publicKey) };
}
