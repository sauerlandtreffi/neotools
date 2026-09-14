export function stem(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base || 'media';
  return base.slice(0, dot) || 'media';
}

export function extOf(name: string, fallback = ''): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return fallback;
  return base.slice(dot).toLowerCase();
}

export function outName(name: string, ext: string): string {
  return `${stem(name)}.${ext.replace(/^\./, '')}`;
}

export function inputAlias(index: number, name: string): string {
  const ext = extOf(name, '.bin');
  return `in${index}${ext || '.bin'}`;
}

export const CONTAINER_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  gif: 'image/gif',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  m4r: 'audio/mp4',
  aac: 'audio/aac',
  aiff: 'audio/aiff',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  json: 'application/json',
  txt: 'text/plain',
};

export function mimeForExt(ext: string): string {
  return CONTAINER_MIME[ext.replace(/^\./, '').toLowerCase()] ?? 'application/octet-stream';
}

export function parseTime(value: string | number | undefined, fallback = 0): number {
  if (value === undefined || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return fallback;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw);
  const parts = raw.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return fallback;
  if (parts.length === 3) return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return fallback;
}

export function atempoChain(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return 'atempo=1';
  const filters: string[] = [];
  let r = rate;
  while (r > 2) {
    filters.push('atempo=2.0');
    r /= 2;
  }
  while (r < 0.5) {
    filters.push('atempo=0.5');
    r *= 2;
  }
  filters.push(`atempo=${Number(r.toFixed(4))}`);
  return filters.join(',');
}

export function vfJoin(parts: Array<string | false | undefined | null>): string[] {
  const list = parts.filter((p): p is string => Boolean(p && String(p).trim()));
  return list.length ? ['-vf', list.join(',')] : [];
}

export function afJoin(parts: Array<string | false | undefined | null>): string[] {
  const list = parts.filter((p): p is string => Boolean(p && String(p).trim()));
  return list.length ? ['-af', list.join(',')] : [];
}
