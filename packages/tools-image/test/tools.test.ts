import { describe, expect, it } from 'vitest';
import { buildExifApp1, injectJpegSegment } from '@neotools/parsers';
import { neoFileFromBytes, runTool } from '@neotools/engine';
import { encodePngRgba } from '../src/codec/png.js';
import { encodeRgba } from '../src/codec/index.js';
import { imageConvert } from '../src/tools/image-convert.js';
import { imageCompress } from '../src/tools/image-compress.js';
import { imageResize } from '../src/tools/image-resize.js';
import { imageCrop } from '../src/tools/image-crop.js';
import { imageRotateFlip } from '../src/tools/image-rotate-flip.js';
import { imageAdjust } from '../src/tools/image-adjust.js';
import { imageWatermark } from '../src/tools/image-watermark.js';
import { imageMetadata } from '../src/tools/image-metadata.js';
import { imageRedact } from '../src/tools/image-redact.js';
import { imageCompare } from '../src/tools/image-compare.js';
import { creatorExportPack } from '../src/tools/creator-export-pack.js';
import { imagePalette } from '../src/tools/image-palette.js';
import { imageDuplicates } from '../src/tools/image-duplicates.js';
import { imageAscii } from '../src/tools/image-ascii.js';
import { imageToAnimation } from '../src/tools/image-to-animation.js';
import { imageExifBatch } from '../src/tools/image-exif-batch.js';
import { decode } from '../src/codec/decode.js';
import { checker, ctx, pngFile, run, tryJpeg } from './helpers.js';

describe('image tools', () => {
  it('resize changes dimensions', async () => {
    const result = await run(imageResize, [pngFile('a.png', 40, 20)], { mode: 'pixels', width: 20, height: 10, allowUpscale: false });
    const img = await decode({ bytes: await result.outputs[0]!.bytes(), name: result.outputs[0]!.name });
    expect(img.width).toBe(20);
    expect(img.height).toBe(10);
  });

  it('crop cuts the region', async () => {
    const result = await run(imageCrop, [pngFile('a.png', 40, 20)], {
      mode: 'rect',
      boxesJson: JSON.stringify([{ x: 4, y: 2, w: 10, h: 8, unit: 'px' }]),
      format: 'png',
    });
    const img = await decode({ bytes: await result.outputs[0]!.bytes(), name: 'c.png' });
    expect(img.width).toBe(10);
    expect(img.height).toBe(8);
  });

  it('rotate 90 swaps sides', async () => {
    const result = await run(imageRotateFlip, [pngFile('a.png', 30, 10)], { turns: '90' });
    const img = await decode({ bytes: await result.outputs[0]!.bytes(), name: 'r.png' });
    expect(img.width).toBe(10);
    expect(img.height).toBe(30);
  });

  it('adjust grayscale changes pixels', async () => {
    const src = pngFile('a.png', 16, 16);
    const result = await run(imageAdjust, [src], { grayscale: true, preset: 'mono' });
    expect(result.outputs[0]!.size).toBeGreaterThan(20);
  });

  it('watermark still produces an image', async () => {
    const result = await run(imageWatermark, [pngFile('a.png', 64, 32)], { text: 'TEST', position: 'center' });
    expect(result.outputs[0]!.mime).toBe('image/png');
  });

  it('compress is smaller or equal for a noisy PNG→JPEG', async () => {
    const data = checker(64, 64);
    const png = neoFileFromBytes('n.png', encodePngRgba(data, 64, 64), 'image/png');
    const result = await run(imageCompress, [png], { preset: 'heavy', format: 'jpeg' });
    expect(result.outputs[0]!.size).toBeLessThanOrEqual(png.size);
  });

  it('compare reports metrics', async () => {
    const a = pngFile('a.png', 24, 24);
    const b = pngFile('b.png', 24, 24);
    const result = await run(imageCompare, [a, b], { scaleMatch: true });
    const json = JSON.parse(new TextDecoder().decode(await result.outputs.find((o) => o.name.endsWith('.json'))!.bytes()));
    expect(json.ssim).toBeGreaterThan(0.5);
    expect(json.psnr).toBeGreaterThan(5);
  });

  it('export-pack lists favicon files', async () => {
    const result = await run(creatorExportPack, [pngFile('logo.png', 64, 64)], { pack: 'favicon' });
    const names = result.outputs.map((o) => o.name);
    expect(names).toContain('favicon.ico');
    expect(names).toContain('android-chrome-192x192.png');
    expect(names).toContain('apple-touch-icon.png');
    expect(names.some((n) => n.endsWith('.zip'))).toBe(true);
    expect(names).toContain('site.webmanifest');
  });

  it('palette returns requested count', async () => {
    const result = await run(imagePalette, [pngFile('p.png', 32, 32)], { count: 4, method: 'median-cut' });
    const json = JSON.parse(new TextDecoder().decode(await result.outputs[0]!.bytes()));
    expect(json.colors.length).toBeGreaterThanOrEqual(2);
    expect(json.colors.length).toBeLessThanOrEqual(4);
  });

  it('duplicates groups exact copies', async () => {
    const a = pngFile('a.png', 16, 16);
    const bytes = await a.bytes();
    const b = neoFileFromBytes('b.png', bytes, 'image/png');
    const c = pngFile('c.png', 20, 12);
    const result = await run(imageDuplicates, [a, b, c], { hamming: 4 });
    const json = JSON.parse(new TextDecoder().decode(await result.outputs[0]!.bytes()));
    expect(json.exact.some((g: { members: string[] }) => g.members.includes('a.png') && g.members.includes('b.png'))).toBe(true);
  });

  it('ascii is non-empty', async () => {
    const result = await run(imageAscii, [pngFile('a.png', 40, 20)], { width: 20, charset: 'standard' });
    const text = new TextDecoder().decode(await result.outputs[0]!.bytes());
    expect(text.split('\n').length).toBeGreaterThan(2);
  });

  it('slideshow gif from two frames', async () => {
    const result = await run(imageToAnimation, [pngFile('a.png', 24, 16), pngFile('b.png', 24, 16)], {
      format: 'gif',
      durationMs: 100,
      width: 24,
    });
    expect(result.outputs[0]!.name).toBe('slideshow.gif');
    expect(result.outputs[0]!.size).toBeGreaterThan(20);
  });

  it('exif-batch renames copies', async () => {
    const result = await run(imageExifBatch, [pngFile('holiday.png', 12, 12)], {
      preset: 'rename',
      pattern: '{YYYY}-{MM}-{DD}_{camera}',
    });
    expect(result.outputs[0]!.name).toMatch(/\.png$/);
    expect(result.outputs[0]!.name).not.toBe('holiday.png');
  });

  it('convert png→bmp', async () => {
    const result = await run(imageConvert, [pngFile('a.png', 12, 10)], { format: 'bmp' });
    expect(result.outputs[0]!.name).toMatch(/\.bmp$/);
  });
});

describe('privacy verify', () => {
  it('metadata strip-all verify is green on a clean PNG', async () => {
    const result = await runTool(imageMetadata, ctx(), [pngFile('a.png', 16, 16)], { mode: 'strip-all' });
    const v = result.report?.verification as { passed: boolean } | undefined;
    expect(v?.passed).toBe(true);
  });

  it('EXIF write/read roundtrip on JPEG when WASM works', async () => {
    if (!(await tryJpeg())) return;
    const raw = await encodeRgba(checker(24, 16), 24, 16, 'jpeg', { quality: 90, keepMetadata: false });
    const withExif = injectJpegSegment(raw, buildExifApp1({ software: 'NeoCam', gps: { lat: 52.5, lon: 13.4 } }));
    const file = neoFileFromBytes('geo.jpg', withExif, 'image/jpeg');
    const read = await runTool(imageMetadata, ctx(), [file], { mode: 'read' });
    const json = JSON.parse(new TextDecoder().decode(await read.outputs[0]!.bytes()));
    expect(json.software).toMatch(/NeoCam/);
    expect(json.gps?.lat).toBeDefined();

    const stripped = await runTool(imageMetadata, ctx(), [file], { mode: 'strip-all' });
    const v = stripped.report?.verification as { passed: boolean } | undefined;
    expect(v?.passed).toBe(true);
  });

  it('redact verify green after black boxes; original without boxes is red', async () => {
    const file = pngFile('secret.png', 40, 40);
    const boxes = JSON.stringify([{ x: 2, y: 2, w: 12, h: 12, unit: 'px' }]);
    const red = await runTool(imageRedact, ctx(), [file], { boxesJson: boxes, mode: 'black', fill: '#000000' });
    const v = red.report?.verification as { passed: boolean } | undefined;
    expect(v?.passed).toBe(true);

    const untouched = await runTool(imageRedact, ctx(), [file], { boxesJson: '[]', mode: 'black' });
    const v2 = untouched.report?.verification as { passed: boolean } | undefined;
    expect(v2?.passed).toBe(false);
  });
});
