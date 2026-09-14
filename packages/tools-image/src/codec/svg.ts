import { isBrowserRuntime, isNodeRuntime } from './wasm.js';
import type { DecodedImage } from './types.js';
import { emptyMeta } from './types.js';
import { decodePng } from './png.js';

export async function decodeSvg(bytes: Uint8Array, targetWidth?: number): Promise<DecodedImage> {
  const svg = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (isBrowserRuntime() && typeof createImageBitmap === 'function') {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const bmp = await createImageBitmap(blob);
    const w = targetWidth ?? bmp.width;
    const h = Math.max(1, Math.round((bmp.height / Math.max(1, bmp.width)) * w));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('SVG: kein 2D-Kontext.');
    ctx.drawImage(bmp, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    return { width: w, height: h, data: new Uint8ClampedArray(img.data), meta: emptyMeta('svg') };
  }
  if (isBrowserRuntime() && typeof Image !== 'undefined' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('SVG konnte nicht gerastert werden.'));
        el.src = url;
      });
      const w = targetWidth ?? (img.naturalWidth || 512);
      const h = Math.max(1, Math.round(((img.naturalHeight || w) / Math.max(1, img.naturalWidth || w)) * w));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('SVG: kein 2D-Kontext.');
      ctx.drawImage(img, 0, 0, w, h);
      const pix = ctx.getImageData(0, 0, w, h);
      return { width: w, height: h, data: new Uint8ClampedArray(pix.data), meta: emptyMeta('svg') };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (isNodeRuntime()) {
    try {
      const { Resvg } = await import('@resvg/resvg-js');
      const resvg = new Resvg(svg, targetWidth ? { fitTo: { mode: 'width', value: targetWidth } } : undefined);
      const rendered = resvg.render();
      const png = decodePng(rendered.asPng());
      if (png) return { ...png, meta: emptyMeta('svg') };
      const w = rendered.width;
      const h = rendered.height;
      return { width: w, height: h, data: new Uint8ClampedArray(rendered.pixels), meta: emptyMeta('svg') };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/nur im Browser|resvg/i.test(msg) === false && /Cannot find|MODULE_NOT_FOUND/i.test(msg)) {
        throw new Error('SVG-Raster nur im Browser (oder optionales @resvg/resvg-js in Node).');
      }
      if (/Cannot find|MODULE_NOT_FOUND|resvg/i.test(msg)) {
        throw new Error('SVG-Raster nur im Browser (oder optionales @resvg/resvg-js in Node).');
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error('SVG-Raster nur im Browser (oder optionales @resvg/resvg-js in Node).');
}

export function encodeSvg(): never {
  throw new Error('SVG-Encode (Vektor) ist nicht Teil dieses Packs — nur Rasterisieren.');
}
