export function fileURLToPath(url: URL | string): string {
  const href = typeof url === 'string' ? url : url.href;
  if (href.startsWith('file://')) return decodeURIComponent(href.slice('file://'.length));
  return href;
}
export function pathToFileURL(path: string): URL {
  return new URL(path, 'file:///');
}
export default { fileURLToPath, pathToFileURL };
