import { describe, expect, it } from 'vitest';
import { imageDenoise } from '../src/tools/image-denoise.js';
import { imageDocRepair } from '../src/tools/image-doc-repair.js';
import { imageRemoveBackground } from '../src/tools/image-remove-background.js';
import { imageScreenshotWorkshop } from '../src/tools/image-screenshot-workshop.js';
import { imageAutoBlur } from '../src/tools/image-auto-blur.js';
import { ctx, fillPoly, pngFile, solid } from './helpers.js';
import { stitchVertical } from '../src/cv/stitch.js';

describe('tools without models', () => {
  it('denoise always runs', async () => {
    const img = solid(24, 24, 80, 90, 100);
    const result = await imageDenoise.run(ctx(), [pngFile('n.png', img)], {
      method: 'bilateral',
      strength: 0.8,
      format: 'png',
      quality: 0.9,
    });
    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0]!.name).toMatch(/denoise/);
  });

  it('doc-repair deskews a synthetic page', async () => {
    const img = solid(80, 60, 245, 245, 245);
    fillPoly(img, [
      { x: 8, y: 6 },
      { x: 72, y: 8 },
      { x: 70, y: 54 },
      { x: 10, y: 52 },
    ], [20, 20, 20]);
    const result = await imageDocRepair.run(ctx(), [pngFile('doc.png', img)], {
      preset: 'drawing',
      output: 'png',
      deskew: true,
      perspective: true,
      ocr: false,
      quality: 0.9,
    });
    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0]!.mime).toBe('image/png');
  });

  it('remove-background reports a clear per-file error when the model is missing', async () => {
    const img = solid(16, 16, 10, 20, 200);
    const result = await imageRemoveBackground.run(ctx(), [pngFile('p.png', img)], {
      model: 'u2netp',
      threshold: 0.45,
      feather: 1,
      background: 'transparent',
      color: '#fff',
      format: 'png',
      quality: 0.9,
      confirmModelDownload: false,
    });
    expect(result.outputs.length).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/Modell|MODEL|fehlt|laden/i);
    const batch = result.report?.['batch'] as Array<{ status: string }>;
    expect(batch?.[0]?.status).toBe('error');
  });

  it('auto-blur runs with heuristics and verify hook', async () => {
    const img = solid(48, 48, 255, 255, 255);
    const result = await imageAutoBlur.run(ctx(), [pngFile('f.png', img)], {
      targets: 'both',
      style: 'bar',
      padding: 2,
      minConfidence: 0.5,
      boxes: [{ x: 4, y: 4, w: 12, h: 12 }],
      format: 'png',
      quality: 0.9,
      confirmModelDownload: false,
    });
    expect(result.outputs.length).toBe(1);
    const v = await imageAutoBlur.verify!(ctx(), result.outputs, {
      targets: 'both',
      style: 'bar',
      padding: 2,
      minConfidence: 0.5,
      boxes: [{ x: 4, y: 4, w: 12, h: 12 }],
      format: 'png',
      quality: 0.9,
      confirmModelDownload: false,
    });
    expect(v.passed).toBe(true);
  });

  it('screenshot workshop stitches and scores without OCR', async () => {
    const a = solid(20, 16, 200, 200, 200);
    const b = solid(20, 16, 180, 180, 180);
    const stitched = stitchVertical([a, b]);
    expect(stitched.height).toBeGreaterThan(16);
    const result = await imageScreenshotWorkshop.run(ctx(), [pngFile('s.png', a)], {
      mode: 'detect',
      style: 'bar',
      cropChrome: false,
      cropSidebar: false,
      washAvatars: false,
      washBadges: false,
      mockup: 'phone',
      background: '#ddd',
      ocr: false,
      format: 'png',
      quality: 0.9,
    });
    expect(result.outputs.length).toBe(1);
    const score = (result.report as { files?: Array<{ screenshotScore?: { score: number } }> })?.files?.[0];
    expect(score?.screenshotScore?.score).toBeGreaterThan(0);
  });
});
