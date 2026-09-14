export function existsSync(): boolean {
  return false;
}
export function readFileSync(): Uint8Array {
  throw new Error('node:fs ist im Browser nicht verfügbar.');
}
export function writeFileSync(): void {
  throw new Error('node:fs ist im Browser nicht verfügbar.');
}
export function mkdirSync(): void {}
export function readdirSync(): string[] {
  return [];
}
export function createReadStream(): never {
  throw new Error('node:fs ist im Browser nicht verfügbar.');
}
export function statSync(): { isFile: () => boolean; isDirectory: () => boolean; size: number } {
  throw new Error('node:fs ist im Browser nicht verfügbar.');
}
export default { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, createReadStream, statSync };
