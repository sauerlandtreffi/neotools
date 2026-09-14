async function unavailable(name: string): Promise<never> {
  throw new Error(`node:fs/promises.${name} ist im Browser nicht verfügbar.`);
}

export async function readFile(..._args: unknown[]): Promise<Uint8Array> {
  return unavailable('readFile');
}
export async function writeFile(..._args: unknown[]): Promise<void> {
  return unavailable('writeFile');
}
export async function mkdir(..._args: unknown[]): Promise<string | undefined> {
  return unavailable('mkdir');
}
export async function mkdtemp(..._args: unknown[]): Promise<string> {
  return unavailable('mkdtemp');
}
export async function readdir(..._args: unknown[]): Promise<string[]> {
  return [];
}
export async function stat(..._args: unknown[]): Promise<{ isFile: () => boolean; isDirectory: () => boolean; size: number }> {
  return unavailable('stat');
}
export async function lstat(..._args: unknown[]): Promise<{ isFile: () => boolean; isDirectory: () => boolean; size: number }> {
  return unavailable('lstat');
}
export async function unlink(..._args: unknown[]): Promise<void> {}
export async function rm(..._args: unknown[]): Promise<void> {}
export async function rmdir(..._args: unknown[]): Promise<void> {}
export async function access(..._args: unknown[]): Promise<void> {
  return unavailable('access');
}
export async function copyFile(..._args: unknown[]): Promise<void> {
  return unavailable('copyFile');
}
export async function rename(..._args: unknown[]): Promise<void> {
  return unavailable('rename');
}
export async function realpath(..._args: unknown[]): Promise<string> {
  return unavailable('realpath');
}
export async function appendFile(..._args: unknown[]): Promise<void> {
  return unavailable('appendFile');
}
export async function chmod(..._args: unknown[]): Promise<void> {}
export async function readlink(..._args: unknown[]): Promise<string> {
  return unavailable('readlink');
}
export async function symlink(..._args: unknown[]): Promise<void> {
  return unavailable('symlink');
}
export const constants = { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 };
