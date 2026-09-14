export function euclid(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    s += d * d;
  }
  return Math.sqrt(s);
}

export function agglomerativeCluster(vectors: Array<ArrayLike<number>>, k: number): number[] {
  const n = vectors.length;
  if (n === 0) return [];
  const kk = Math.max(1, Math.min(k, n));
  const labels = Array.from({ length: n }, (_, i) => i);
  let clusters = n;
  while (clusters > kk) {
    let best = Infinity;
    let ia = 0;
    let ib = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (labels[i] === labels[j]) continue;
        const d = euclid(vectors[i]!, vectors[j]!);
        if (d < best) {
          best = d;
          ia = i;
          ib = j;
        }
      }
    }
    const from = labels[ib]!;
    const to = labels[ia]!;
    for (let i = 0; i < n; i++) if (labels[i] === from) labels[i] = to;
    clusters -= 1;
  }
  const map = new Map<number, number>();
  let next = 0;
  return labels.map((l) => {
    if (!map.has(l)) map.set(l, next++);
    return map.get(l)!;
  });
}

/** Auto-k 1–6 via mean intra-cluster tightness vs merge jump. */
export function autoK(vectors: Array<ArrayLike<number>>, maxK = 6): number {
  const n = vectors.length;
  if (n <= 1) return 1;
  const cap = Math.min(maxK, n);
  let bestK = 1;
  let bestScore = -Infinity;
  for (let k = 1; k <= cap; k++) {
    const labels = agglomerativeCluster(vectors, k);
    const score = silhouette(vectors, labels);
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  return bestK;
}

export function silhouette(vectors: Array<ArrayLike<number>>, labels: number[]): number {
  const n = vectors.length;
  if (n <= 1) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const li = labels[i]!;
    let aSum = 0;
    let aN = 0;
    const bMap = new Map<number, { s: number; n: number }>();
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = euclid(vectors[i]!, vectors[j]!);
      if (labels[j] === li) {
        aSum += d;
        aN += 1;
      } else {
        const row = bMap.get(labels[j]!) ?? { s: 0, n: 0 };
        row.s += d;
        row.n += 1;
        bMap.set(labels[j]!, row);
      }
    }
    const a = aN ? aSum / aN : 0;
    let b = Infinity;
    for (const row of bMap.values()) {
      const mean = row.s / row.n;
      if (mean < b) b = mean;
    }
    if (!Number.isFinite(b)) b = 0;
    const s = Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
    acc += s;
  }
  return acc / n;
}
