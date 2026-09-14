export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

export function cosineDistance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return 1 - cosine(a, b);
}

export interface Peak {
  index: number;
  distance: number;
}

/** Local maxima of consecutive distances, at least `minGap` apart. */
export function distancePeaks(distances: number[], minGap: number, k = 1.1): Peak[] {
  if (!distances.length) return [];
  const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance = distances.reduce((a, b) => a + (b - mean) ** 2, 0) / distances.length;
  const std = Math.sqrt(variance);
  const thresh = mean + k * std;
  const raw: Peak[] = [];
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i]!;
    const prev = distances[i - 1] ?? -Infinity;
    const next = distances[i + 1] ?? -Infinity;
    if (d >= thresh && d >= prev && d >= next) raw.push({ index: i, distance: d });
  }
  raw.sort((a, b) => b.distance - a.distance);
  const kept: Peak[] = [];
  for (const p of raw) {
    if (kept.every((q) => Math.abs(q.index - p.index) >= minGap)) kept.push(p);
  }
  return kept.sort((a, b) => a.index - b.index);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
