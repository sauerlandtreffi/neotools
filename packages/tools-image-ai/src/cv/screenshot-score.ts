import type { RasterImage } from '../raster.js';
import { toGray } from './color.js';
import { sobel } from './edges.js';
import { hasJpegExif } from './filters.js';

export interface ScreenshotScore {
  score: number;
  reasons: string[];
  likely: 'screenshot' | 'photo' | 'uncertain';
}

const UI_COLORS = new Set([
  'ffffff',
  '000000',
  'f3f3f3',
  '1a1a1a',
  '0078d4',
  '0a84ff',
  '1877f2',
  '24292f',
]);

export function screenshotVsPhoto(img: RasterImage, bytes?: Uint8Array): ScreenshotScore {
  const reasons: string[] = [];
  let score = 0.5;
  if (bytes && hasJpegExif(bytes)) {
    score -= 0.25;
    reasons.push('EXIF-Kamera vorhanden');
  } else {
    score += 0.15;
    reasons.push('kein Kamera-EXIF');
  }
  const gray = toGray(img);
  const { mag } = sobel(gray, img.width, img.height);
  let strong = 0;
  for (const v of mag) if (v > 80) strong++;
  const edgeRatio = strong / mag.length;
  if (edgeRatio > 0.08) {
    score += 0.15;
    reasons.push('harte UI-Kanten');
  } else if (edgeRatio < 0.03) {
    score -= 0.1;
    reasons.push('weiche Kanten (Foto)');
  }
  let exact = 0;
  const sample = Math.max(1, Math.floor((img.width * img.height) / 4000));
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4 * sample) {
    n++;
    const hex =
      img.data[i]!.toString(16).padStart(2, '0') +
      img.data[i + 1]!.toString(16).padStart(2, '0') +
      img.data[i + 2]!.toString(16).padStart(2, '0');
    if (UI_COLORS.has(hex)) exact++;
  }
  if (n && exact / n > 0.08) {
    score += 0.15;
    reasons.push('exakte UI-Farben');
  }
  score = Math.max(0, Math.min(1, score));
  const likely = score >= 0.62 ? 'screenshot' : score <= 0.4 ? 'photo' : 'uncertain';
  return { score, reasons, likely };
}
