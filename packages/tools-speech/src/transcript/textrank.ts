export function keywords(text: string, n = 6): string[] {
  const stop = new Set(
    'der die das den dem des ein eine einer eines und oder aber mit von zu im in auf für als ist sind war wie wir ihr sie ich du es the a an and or but with from for as is was we you they i'.split(
      /\s+/,
    ),
  );
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const unique = [...freq.keys()];
  const idx = new Map(unique.map((w, i) => [w, i]));
  const m = unique.length;
  if (!m) return [];
  const graph = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < words.length - 1; i++) {
    const a = idx.get(words[i]!);
    const b = idx.get(words[i + 1]!);
    if (a === undefined || b === undefined || a === b) continue;
    const rowA = graph[a];
    const rowB = graph[b];
    if (rowA) rowA[b] = (rowA[b] ?? 0) + 1;
    if (rowB) rowB[a] = (rowB[a] ?? 0) + 1;
  }
  const score = new Float64Array(m).fill(1);
  for (let iter = 0; iter < 20; iter++) {
    const next = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let j = 0; j < m; j++) {
        const w = graph[j]![i]!;
        if (!w) continue;
        let d = 0;
        for (let k = 0; k < m; k++) d += graph[j]![k]!;
        s += (w / Math.max(1, d)) * score[j]!;
      }
      next[i] = 0.15 + 0.85 * s + (freq.get(unique[i]!) ?? 1) * 0.01;
    }
    score.set(next);
  }
  return unique
    .map((w, i) => ({ w, s: score[i]! }))
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map((x) => x.w);
}

export function titleFromText(text: string): string {
  const keys = keywords(text, 4);
  if (!keys.length) return text.slice(0, 42).trim() || 'Kapitel';
  return keys.map((k) => k[0]!.toUpperCase() + k.slice(1)).join(' ');
}
