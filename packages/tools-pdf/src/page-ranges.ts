export function parseNumberList(value: string | number[] | undefined): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  return value
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/** 1-based spec like "1-3,5" or "all" → 0-based unique sorted indices. */
export function parsePageSpec(spec: string | undefined, pageCount: number): number[] {
  const raw = (spec ?? 'all').trim();
  if (!raw || raw.toLowerCase() === 'all') {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const range = /^(\d+)\s*-\s*(\d+)$/.exec(p);
    if (range) {
      let a = Number(range[1]);
      let b = Number(range[2]);
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) {
        if (i >= 1 && i <= pageCount) out.add(i - 1);
      }
      continue;
    }
    const n = Number(p);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) out.add(n - 1);
  }
  return [...out].sort((a, b) => a - b);
}

export function parseRanges(spec: string, pageCount: number): number[][] {
  const groups: number[][] = [];
  for (const part of spec.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const pages = parsePageSpec(p, pageCount);
    if (pages.length) groups.push(pages);
  }
  return groups;
}

export function everyNChunks(pageCount: number, n: number): number[][] {
  const size = Math.max(1, Math.floor(n));
  const groups: number[][] = [];
  for (let i = 0; i < pageCount; i += size) {
    const chunk: number[] = [];
    for (let j = i; j < Math.min(pageCount, i + size); j++) chunk.push(j);
    groups.push(chunk);
  }
  return groups;
}

export const pageListField = {
  description: 'Kommagetrennte 1-basierte Seiten (z. B. 1-3,5) oder all',
};
