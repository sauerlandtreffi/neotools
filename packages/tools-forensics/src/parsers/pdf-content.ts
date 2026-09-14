export interface PdfTextRun {
  text: string;
  fontSize: number;
  rotation: number;
  renderMode: number;
  fill?: [number, number, number];
  extGState?: string;
  opacity?: number;
  page: number;
}

export interface PdfContentScan {
  runs: PdfTextRun[];
  hiddenRuns: PdfTextRun[];
  watermarkRuns: PdfTextRun[];
  gsOpacities: Record<string, number>;
}

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '%') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i += 1;
      continue;
    }
    if (c === '(') {
      let s = '';
      i += 1;
      let depth = 1;
      while (i < src.length && depth) {
        const ch = src[i]!;
        if (ch === '\\') {
          s += src[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (ch === '(') depth += 1;
        if (ch === ')') {
          depth -= 1;
          if (!depth) {
            i += 1;
            break;
          }
        }
        s += ch;
        i += 1;
      }
      tokens.push(`STR:${s}`);
      continue;
    }
    if (c === '[') {
      const start = i;
      let depth = 1;
      i += 1;
      while (i < src.length && depth) {
        if (src[i] === '[') depth += 1;
        if (src[i] === ']') depth -= 1;
        i += 1;
      }
      tokens.push(src.slice(start, i));
      continue;
    }
    if (c === '/') {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9*._+-]/.test(src[j]!)) j += 1;
      tokens.push(src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '<' && src[i + 1] === '<') {
      i += 2;
      tokens.push('<<');
      continue;
    }
    if (c === '>' && src[i + 1] === '>') {
      i += 2;
      tokens.push('>>');
      continue;
    }
    if (c === '<' ) {
      const end = src.indexOf('>', i + 1);
      if (end < 0) break;
      tokens.push(src.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < src.length && !/[\s/<>[\]()%]/.test(src[j]!)) j += 1;
    if (j === i) {
      i += 1;
      continue;
    }
    tokens.push(src.slice(i, j));
    i = j;
  }
  return tokens;
}

function nums(tokens: string[], end: number, n: number): number[] {
  const out: number[] = [];
  for (let k = n; k >= 1; k--) {
    const t = tokens[end - k];
    const v = t ? Number(t) : NaN;
    out.push(Number.isFinite(v) ? v : 0);
  }
  return out;
}

function tjText(token: string): string {
  if (token.startsWith('STR:')) return token.slice(4);
  if (token.startsWith('[')) {
    const parts = [...token.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((m) => m[0].slice(1, -1).replace(/\\(.)/g, '$1'));
    return parts.join('');
  }
  return '';
}

export function scanPdfContent(content: string, page: number, gs: Record<string, { ca?: number; CA?: number }>): PdfContentScan {
  const tokens = tokenize(content);
  const runs: PdfTextRun[] = [];
  let fontSize = 12;
  let renderMode = 0;
  let rotation = 0;
  let fill: [number, number, number] | undefined;
  let gsName: string | undefined;
  let opacity: number | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === 'Tf') {
      fontSize = Math.abs(Number(tokens[i - 1]) || fontSize);
    } else if (t === 'Tr') {
      renderMode = Number(tokens[i - 1]) || 0;
    } else if (t === 'Tm') {
      const m = nums(tokens, i, 6);
      rotation = (Math.atan2(m[1] ?? 0, m[0] ?? 1) * 180) / Math.PI;
    } else if (t === 'rg' || t === 'RG') {
      const c = nums(tokens, i, 3);
      fill = [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
    } else if (t === 'g' || t === 'G') {
      const c = nums(tokens, i, 1);
      const v = c[0] ?? 0;
      fill = [v, v, v];
    } else if (t === 'gs') {
      const name = tokens[i - 1] ?? '';
      gsName = name.startsWith('/') ? name.slice(1) : name;
      const st = gs[gsName];
      if (st) opacity = st.ca ?? st.CA;
    } else if (t === 'Tj' || t === "'" || t === '"' || t === 'TJ') {
      const text = tjText(tokens[i - 1] ?? '');
      if (text) {
        runs.push({
          text,
          fontSize,
          rotation,
          renderMode,
          fill,
          extGState: gsName,
          opacity,
          page,
        });
      }
    }
  }

  const hiddenRuns = runs.filter((r) => {
    if (r.renderMode === 3) return true;
    if (r.fill && r.fill.every((c) => c > 0.95)) return true;
    if (r.opacity !== undefined && r.opacity < 0.05) return true;
    return false;
  });

  const watermarkRuns = runs.filter((r) => {
    const rot = Math.abs(r.rotation) % 180;
    const angle = rot > 90 ? 180 - rot : rot;
    const angled = angle >= 25 && angle <= 65;
    const large = r.fontSize >= 24;
    const faint = r.opacity !== undefined && r.opacity < 1;
    return (angled && large) || (faint && large) || (angled && faint);
  });

  const gsOpacities: Record<string, number> = {};
  for (const [k, v] of Object.entries(gs)) {
    const o = v.ca ?? v.CA;
    if (o !== undefined) gsOpacities[k] = o;
  }

  return { runs, hiddenRuns, watermarkRuns, gsOpacities };
}
