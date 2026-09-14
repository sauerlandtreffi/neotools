export function csvEscape(value: unknown): string {
  const s = String(value ?? '');
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>, sep = ','): string {
  const lines = [headers.map(csvEscape).join(sep)];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(sep));
  }
  return lines.join('\n') + '\n';
}

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
