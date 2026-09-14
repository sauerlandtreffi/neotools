const UTF16LE = [0xff, 0xfe] as const;
const UTF16BE = [0xfe, 0xff] as const;
const UTF8BOM = [0xef, 0xbb, 0xbf] as const;

export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === UTF8BOM[0] && bytes[1] === UTF8BOM[1] && bytes[2] === UTF8BOM[2]) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === UTF16LE[0] && bytes[1] === UTF16LE[1]) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === UTF16BE[0] && bytes[1] === UTF16BE[1]) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const replacements = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacements > utf8.length * 0.02 && replacements > 2) {
    return new TextDecoder('latin1').decode(bytes);
  }
  return utf8.replace(/^\uFEFF/, '');
}

export function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
