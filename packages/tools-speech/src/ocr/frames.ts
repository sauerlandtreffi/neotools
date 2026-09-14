import type { ToolContext } from '@neotools/engine';

export function timestampFromName(name: string, fps = 25): number | undefined {
  const base = name.replace(/^.*[/\\]/, '');
  const tEq = base.match(/t[=_]?(\d+(?:\.\d+)?)/i);
  if (tEq) return Number(tEq[1]);
  const ms = base.match(/(\d+)ms/i);
  if (ms) return Number(ms[1]) / 1000;
  const hms = base.match(/(\d{1,2})[-_](\d{2})[-_](\d{2})(?:[.,_-](\d{1,3}))?/);
  if (hms) {
    const frac = hms[4] ? Number(hms[4].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
    return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) + frac;
  }
  const frame = base.match(/(?:frame|img|pic)[-_]?(\d+)/i) ?? base.match(/(\d{3,})/);
  if (frame) return Number(frame[1]) / Math.max(1, fps);
  return undefined;
}

export async function recognizeFrame(
  image: { data: Uint8ClampedArray; width: number; height: number },
  langs: string[],
  ctx: ToolContext,
): Promise<string> {
  try {
    const pdf = (await import('@neotools/tools-pdf')) as {
      recognizePage: (
        img: { data: Uint8ClampedArray; width: number; height: number },
        langs: string[],
        ctx: ToolContext,
      ) => Promise<{ words: Array<{ text: string }> }>;
    };
    const res = await pdf.recognizePage(image, langs, ctx);
    return res.words.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim();
  } catch (err) {
    throw new Error(
      `OCR nicht verfügbar (recognizePage aus @neotools/tools-pdf): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function dedupeLines<T extends { text: string }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const row of rows) {
    const norm = row.text.toLowerCase().replace(/\s+/g, ' ').trim();
    const last = out[out.length - 1];
    if (last && last.text.toLowerCase().replace(/\s+/g, ' ').trim() === norm) continue;
    out.push(row);
  }
  return out;
}
