import { luma } from '../codec/pixels.js';
import { resample } from '../codec/resample.js';

const SETS: Record<string, string> = {
  standard: ' .:-=+*#%@',
  detailed: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  blocks: ' ░▒▓█',
  braille: 'braille',
};

function brailleCell(g: number[], invert: boolean): string {
  // 2x4 dots
  const dots = [0, 1, 2, 6, 3, 4, 5, 7];
  let bits = 0;
  for (let i = 0; i < 8; i++) {
    const on = invert ? (g[i] ?? 0) < 128 : (g[i] ?? 0) >= 128;
    if (on) bits |= 1 << dots[i]!;
  }
  return String.fromCodePoint(0x2800 + bits);
}

export function imageToAscii(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { cols: number; charset: string; invert: boolean },
): string {
  const set = SETS[opts.charset] ?? SETS.standard!;
  if (set === 'braille') {
    const cols = opts.cols;
    const rows = Math.max(1, Math.round((height / width) * cols * 0.5));
    const tw = cols * 2;
    const th = rows * 4;
    const scaled = resample(data, width, height, tw, th, 'box');
    const lines: string[] = [];
    for (let y = 0; y < rows; y++) {
      let line = '';
      for (let x = 0; x < cols; x++) {
        const cell: number[] = [];
        for (let dy = 0; dy < 4; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((y * 4 + dy) * tw + (x * 2 + dx)) * 4;
            cell.push(luma(scaled.data[i]!, scaled.data[i + 1]!, scaled.data[i + 2]!));
          }
        }
        line += brailleCell(cell, opts.invert);
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
  const cols = opts.cols;
  const rows = Math.max(1, Math.round((height / width) * cols * 0.45));
  const scaled = resample(data, width, height, cols, rows, 'box');
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      let t = luma(scaled.data[i]!, scaled.data[i + 1]!, scaled.data[i + 2]!) / 255;
      if (opts.invert) t = 1 - t;
      const idx = Math.min(set.length - 1, Math.floor(t * set.length));
      line += set[idx];
    }
    lines.push(line);
  }
  return lines.join('\n');
}
