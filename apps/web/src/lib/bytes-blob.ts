/** Copy into a standalone ArrayBuffer so `new Blob` accepts the view under TS 5.7+. */
export function bytesToBlob(data: Uint8Array, mime: string): Blob {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy.buffer], { type: mime });
}
