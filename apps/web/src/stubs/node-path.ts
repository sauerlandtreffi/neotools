export function dirname(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i <= 0 ? '.' : n.slice(0, i);
}
export function basename(p: string, ext?: string): string {
  const n = p.replace(/\\/g, '/').split('/').pop() ?? p;
  return ext && n.endsWith(ext) ? n.slice(0, -ext.length) : n;
}
export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i);
}
export function join(...parts: string[]): string {
  return parts
    .filter((p) => p && p !== '.')
    .join('/')
    .replace(/\/+/g, '/');
}
export function resolve(...parts: string[]): string {
  return join(...parts);
}
export function relative(_from: string, to: string): string {
  return to;
}
export function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}
export default { dirname, basename, extname, join, resolve, relative, isAbsolute };
