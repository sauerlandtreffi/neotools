import { asBufferSource, isNodeRuntime, readPackageFile } from '../codec/wasm.js';

interface OpenTypeFont {
  getPath(
    text: string,
    x: number,
    y: number,
    fontSize: number,
  ): { commands: Array<{ type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }> };
}

type Font = OpenTypeFont;

let cached: Font | null | undefined;
let parseOpenType: ((buffer: ArrayBuffer) => Font) | undefined;

async function loadOpentypeParse(): Promise<(buffer: ArrayBuffer) => Font> {
  if (parseOpenType) return parseOpenType;
  const mod = (await import('opentype.js')) as { parse?: (buffer: ArrayBuffer) => Font; default?: { parse?: (buffer: ArrayBuffer) => Font } };
  const fn = typeof mod.parse === 'function' ? mod.parse : mod.default?.parse;
  if (typeof fn === 'function') {
    parseOpenType = fn;
    return fn;
  }
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url)('opentype.js') as { parse?: (buffer: ArrayBuffer) => Font };
  if (typeof req.parse !== 'function') throw new Error('opentype.js parse() fehlt.');
  parseOpenType = req.parse;
  return req.parse;
}

async function loadFontBytes(): Promise<Uint8Array | null> {
  const fromPkg = await readPackageFile('@neotools/tools-image/assets/fonts/SourceSans3-Regular.otf');
  if (fromPkg) return fromPkg;
  if (isNodeRuntime()) {
    try {
      const { readFile } = await import('node:fs/promises');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const here = fileURLToPath(new URL('.', import.meta.url));
      const candidates = [
        join(here, '../../assets/fonts/SourceSans3-Regular.otf'),
        join(dirname(here), '../assets/fonts/SourceSans3-Regular.otf'),
        join(process.cwd(), 'packages/tools-image/assets/fonts/SourceSans3-Regular.otf'),
      ];
      for (const p of candidates) {
        try {
          return new Uint8Array(await readFile(p));
        } catch {
          // next
        }
      }
    } catch {
      return null;
    }
  } else {
    try {
      const res = await fetch('/assets/fonts/SourceSans3-Regular.otf');
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

export async function loadOflFont(): Promise<Font | null> {
  if (cached !== undefined) return cached;
  const bytes = await loadFontBytes();
  if (!bytes) {
    cached = null;
    return null;
  }
  const parse = await loadOpentypeParse();
  cached = parse(asBufferSource(bytes));
  return cached;
}

export function stampOpenType(
  font: Font,
  dest: Uint8ClampedArray,
  dw: number,
  dh: number,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  rgba: readonly [number, number, number, number],
): void {
  const path = font.getPath(text, x, y + fontSize * 0.8, fontSize);
  rasterizePath(dest, dw, dh, path.commands, rgba);
}

function rasterizePath(
  dest: Uint8ClampedArray,
  dw: number,
  dh: number,
  commands: Array<{ type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }>,
  rgba: readonly [number, number, number, number],
): void {
  const edges: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const line = (x: number, y: number) => {
    edges.push({ x0: cx, y0: cy, x1: x, y1: y });
    cx = x;
    cy = y;
  };
  for (const c of commands) {
    if (c.type === 'M') {
      cx = c.x ?? 0;
      cy = c.y ?? 0;
      sx = cx;
      sy = cy;
    } else if (c.type === 'L') {
      line(c.x ?? cx, c.y ?? cy);
    } else if (c.type === 'C') {
      const x0 = cx;
      const y0 = cy;
      const x1 = c.x1 ?? x0;
      const y1 = c.y1 ?? y0;
      const x2 = c.x2 ?? x0;
      const y2 = c.y2 ?? y0;
      const x3 = c.x ?? x0;
      const y3 = c.y ?? y0;
      for (let t = 1; t <= 8; t++) {
        const u = t / 8;
        const mt = 1 - u;
        const x = mt * mt * mt * x0 + 3 * mt * mt * u * x1 + 3 * mt * u * u * x2 + u * u * u * x3;
        const y = mt * mt * mt * y0 + 3 * mt * mt * u * y1 + 3 * mt * u * u * y2 + u * u * u * y3;
        line(x, y);
      }
    } else if (c.type === 'Q') {
      const x0 = cx;
      const y0 = cy;
      const x1 = c.x1 ?? x0;
      const y1 = c.y1 ?? y0;
      const x2 = c.x ?? x0;
      const y2 = c.y ?? y0;
      for (let t = 1; t <= 6; t++) {
        const u = t / 6;
        const mt = 1 - u;
        line(mt * mt * x0 + 2 * mt * u * x1 + u * u * x2, mt * mt * y0 + 2 * mt * u * y1 + u * u * y2);
      }
    } else if (c.type === 'Z') {
      line(sx, sy);
    }
  }
  const minY = Math.max(0, Math.floor(Math.min(...edges.map((e) => Math.min(e.y0, e.y1)))));
  const maxY = Math.min(dh - 1, Math.ceil(Math.max(...edges.map((e) => Math.max(e.y0, e.y1)))));
  if (!edges.length) return;
  const a = (rgba[3] ?? 255) / 255;
  for (let y = minY; y <= maxY; y++) {
    const ys = y + 0.5;
    const xs: number[] = [];
    for (const e of edges) {
      if ((e.y0 <= ys && e.y1 > ys) || (e.y1 <= ys && e.y0 > ys)) {
        const t = (ys - e.y0) / (e.y1 - e.y0 || 1e-6);
        xs.push(e.x0 + t * (e.x1 - e.x0));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.floor(xs[i]!));
      const x1 = Math.min(dw - 1, Math.ceil(xs[i + 1]!));
      for (let x = x0; x <= x1; x++) {
        const di = (y * dw + x) * 4;
        dest[di] = Math.round((dest[di] ?? 0) * (1 - a) + rgba[0] * a);
        dest[di + 1] = Math.round((dest[di + 1] ?? 0) * (1 - a) + rgba[1] * a);
        dest[di + 2] = Math.round((dest[di + 2] ?? 0) * (1 - a) + rgba[2] * a);
        dest[di + 3] = 255;
      }
    }
  }
}
