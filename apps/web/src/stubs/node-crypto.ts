export const webcrypto = globalThis.crypto;

export function createHash(): never {
  throw new Error('node:crypto.createHash ist im Browser nicht verfügbar.');
}
export function randomBytes(): never {
  throw new Error('node:crypto.randomBytes ist im Browser nicht verfügbar.');
}
export function createHmac(): never {
  throw new Error('node:crypto.createHmac ist im Browser nicht verfügbar.');
}
export default { webcrypto, createHash, randomBytes, createHmac };
