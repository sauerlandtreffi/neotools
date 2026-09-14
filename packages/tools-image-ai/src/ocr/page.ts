import type { ToolContext } from '@neotools/engine';
import type { RasterImage } from '../raster.js';
import type { WordBox } from '../cv/plates.js';

export interface OcrResult {
  text: string;
  words: WordBox[];
  warning?: string;
}

type RecognizePage = (
  imageData: { data: Uint8ClampedArray; width: number; height: number },
  langs: string[],
  ctx: ToolContext,
) => Promise<{ words: WordBox[]; meanConfidence: number }>;

let override: ((img: RasterImage, langs: string[], ctx: ToolContext) => Promise<OcrResult>) | null = null;

export function setOcrOverride(fn: typeof override): void {
  override = fn;
}

export async function ocrRaster(img: RasterImage, langs: string[], ctx: ToolContext): Promise<OcrResult> {
  if (override) return override(img, langs, ctx);
  if (!ctx.platform.capabilities.ocr) {
    return { text: '', words: [], warning: 'OCR-Capability fehlt.' };
  }
  try {
    const mod = (await import('@neotools/tools-pdf')) as { recognizePage?: RecognizePage };
    if (typeof mod.recognizePage !== 'function') {
      return { text: '', words: [], warning: 'recognizePage nicht verfügbar.' };
    }
    const res = await mod.recognizePage(img, langs.length ? langs : ['deu', 'eng'], ctx);
    return {
      text: res.words.map((w) => w.text).join(' '),
      words: res.words,
    };
  } catch (err) {
    return { text: '', words: [], warning: err instanceof Error ? err.message : String(err) };
  }
}
