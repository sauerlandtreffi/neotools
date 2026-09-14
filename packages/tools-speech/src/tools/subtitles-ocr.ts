import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { writeSrt } from '../captions/write.js';
import { dedupeLines, recognizeFrame, timestampFromName } from '../ocr/frames.js';
import { SPEECH_LICENSES } from '../licenses.js';
import { provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  fps: z.coerce.number().min(1).max(60).default(25),
  langs: z.string().default('deu+eng'),
  cueDuration: z.coerce.number().min(0.2).max(8).default(1.2),
});

export const subtitlesOcr = defineTool({
  id: 'subtitles-ocr',
  pack: 'speech',
  category: 'speech',
  title: { de: 'OCR → Untertitel', en: 'OCR → subtitles' },
  description: {
    de: 'Eingebrannte Untertitel/Whiteboard aus video-to-frames-Bildern (Zeitstempel im Dateinamen) per Tesseract → SRT.',
    en: 'Burned-in captions/whiteboard from video-to-frames images (timestamp in filename) via Tesseract → SRT.',
  },
  inputs: {
    accept: ['image/png', 'image/jpeg', 'image/webp', '.png', '.jpg', '.jpeg', '.webp'],
    multiple: true,
    min: 1,
  },
  outputs: { mime: ['application/x-subrip'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['ocr untertitel', 'burned in captions'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const langs = parsed.langs.split(/[+,]/).map((s) => s.trim()).filter(Boolean);
    const rows: Array<{ start: number; end: number; text: string }> = [];
    for (const [i, file] of files.entries()) {
      ctx.progress(i / files.length, file.name);
      const start = timestampFromName(file.name, parsed.fps) ?? i / parsed.fps;
      try {
        const png = await maybeRaster(file, ctx);
        const text = await recognizeFrame(png, langs.length ? langs : ['deu', 'eng'], ctx);
        if (text) rows.push({ start, end: start + parsed.cueDuration, text });
      } catch (err) {
        ctx.log('warn', `${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const cues = dedupeLines(rows).map((r, i) => ({ ...r, index: i + 1 }));
    return {
      outputs: [textFile(`${stem(files[0]?.name ?? 'ocr')}.srt`, writeSrt(cues), 'application/x-subrip')],
      warnings: [],
      report: await provenanceReport('subtitles-ocr', parsed, files, { cues: cues.length }),
    };
  },
});

async function maybeRaster(
  file: { name: string; mime: string; bytes(): Promise<Uint8Array> },
  _ctx: import('@neotools/engine').ToolContext,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bytes = await file.bytes();
  if (typeof createImageBitmap === 'function') {
    const blob = new Blob([bytes.slice()], { type: file.mime || 'image/png' });
    const bmp = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const c = canvas.getContext('2d');
    if (!c) throw new Error('Kein 2D-Kontext.');
    c.drawImage(bmp, 0, 0);
    const img = c.getImageData(0, 0, bmp.width, bmp.height);
    return { data: img.data, width: bmp.width, height: bmp.height };
  }
  try {
    const img = (await import('@neotools/tools-image')) as {
      decode: (
        input: { bytes: Uint8Array; name?: string; mime?: string },
      ) => Promise<{ data: Uint8ClampedArray; width: number; height: number }>;
    };
    const decoded = await img.decode({ bytes, name: file.name, mime: file.mime });
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  } catch {
    try {
      const parsers = (await import('@neotools/parsers')) as {
        decodePngRgba?: (b: Uint8Array) => { data: Uint8ClampedArray; width: number; height: number } | undefined;
      };
      const png = parsers.decodePngRgba?.(bytes);
      if (png) return png;
    } catch {
      // optional
    }
  }
  throw new Error(
    `Frame nicht rasterisierbar (${file.name}). Browser: decodeAudio-Pfad via createImageBitmap; Node: @neotools/tools-image.`,
  );
}
