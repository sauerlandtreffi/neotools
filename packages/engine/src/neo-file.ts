import { MIME } from './types.js';
import type { NeoFile } from './types.js';

const EXT_MIME: Record<string, string> = {
  '.pdf': MIME.pdf,
  '.png': MIME.png,
  '.jpg': MIME.jpeg,
  '.jpeg': MIME.jpeg,
  '.txt': MIME.txt,
  '.json': MIME.json,
  '.webp': 'image/webp',
  '.md': MIME.md,
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.heic': 'image/heic',
  '.jxl': 'image/jxl',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.m4r': 'audio/mp4',
  '.aac': 'audio/aac',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.srt': 'application/x-subrip',
  '.vtt': 'text/vtt',
  '.ass': 'text/x-ssa',
  '.zip': MIME.zip,
  '.xml': MIME.xml,
  '.csv': MIME.csv,
  '.ics': MIME.ics,
  '.html': MIME.html,
  '.htm': MIME.html,
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  '.docx': MIME.docx,
  '.xlsx': MIME.xlsx,
  '.pptx': MIME.pptx,
  '.epub': MIME.epub,
  '.yaml': MIME.yaml,
  '.yml': MIME.yaml,
  '.vcf': MIME.vcf,
  '.vcard': MIME.vcf,
  '.woff': MIME.woff,
  '.woff2': MIME.woff2,
  '.ttf': MIME.ttf,
  '.otf': MIME.otf,
};

export function mimeFromName(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return EXT_MIME[lower.slice(dot)] ?? 'application/octet-stream';
}

export function neoFileFromBytes(
  name: string,
  data: Uint8Array,
  mime = mimeFromName(name),
): NeoFile {
  const copy = data;
  return {
    name,
    mime,
    size: copy.byteLength,
    async bytes() {
      return copy;
    },
  };
}

export async function neoFileFromPath(path: string): Promise<NeoFile> {
  const { readFile } = await import('node:fs/promises');
  const { basename } = await import('node:path');
  const buf = await readFile(path);
  return neoFileFromBytes(basename(path), new Uint8Array(buf));
}

export async function writeNeoFile(file: NeoFile, destPath: string): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(destPath), { recursive: true });
  await writeFile(destPath, await file.bytes());
}

export function transferFiles(
  files: Array<{ name: string; mime: string; data: Uint8Array }>,
): NeoFile[] {
  return files.map((f) => neoFileFromBytes(f.name, f.data, f.mime));
}
