export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (q) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',' || c === ';') {
        out.push(cur.trim());
        cur = '';
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]!);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = cells[i] ?? '';
    });
    return rec;
  });
}

export function filenameFromPattern(pattern: string, row: Record<string, string>, n: number): string {
  let out = pattern.replace(/\{n\}/g, String(n));
  for (const [k, v] of Object.entries(row)) {
    out = out.replaceAll(`{${k}}`, v.replace(/[^\w.-]+/g, '_'));
  }
  if (!out.toLowerCase().endsWith('.pdf')) out += '.pdf';
  return out;
}
