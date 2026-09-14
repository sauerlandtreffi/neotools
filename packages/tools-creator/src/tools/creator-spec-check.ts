import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { getTarget, PLATFORM_TARGETS, ratioClose, type PlatformTarget } from '../platform-targets.js';
import { coverFit, decodeAny, encodeNamed, isVideoFile, stem } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, mp4Tail, probe, requireFfmpeg, scaleCropVf } from '../media.js';

const options = z.object({
  platform: z.string().default('instagram'),
  targetId: z.string().default(''),
  autofix: z.boolean().default(false),
});

export interface SpecViolation {
  code: string;
  message: { de: string; en: string };
  actual?: string;
  expected?: string;
}

export const creatorSpecCheck = defineTool({
  id: 'creator-spec-check',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Spec Check / Plattform-Limits', en: 'Spec check / platform limits' },
  description: {
    de: 'Datei gegen Plattform-Limits prüfen und optional „Make it fit“ (Zuschnitt/Re-Encode).',
    en: 'Check a file against platform limits and optionally make it fit (crop/re-encode).',
  },
  inputs: { accept: IMAGE_VIDEO_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['application/json', 'image/jpeg', 'video/mp4'] },
  options,
  presets: PLATFORM_TARGETS.filter((t) => t.kind === 'image' || t.platform === 'instagram').slice(0, 6).map((t) => ({
    id: t.id,
    title: t.label,
    options: { platform: t.platform, targetId: t.id },
  })),
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['instagram limits', 'spec check', 'make it fit'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const target =
      (parsed.targetId && getTarget(parsed.targetId)) ||
      PLATFORM_TARGETS.find((t) => t.platform === parsed.platform && t.kind === (isVideoFile(file) ? 'video' : 'image')) ||
      PLATFORM_TARGETS.find((t) => t.platform === parsed.platform) ||
      PLATFORM_TARGETS[0]!;
    const violations = await collectViolations(ctx, file, target);
    const pipeline = {
      version: 1,
      steps: [
        {
          tool: isVideoFile(file) ? 'creator-platform-pack' : 'creator-platform-pack',
          options: { targets: target.id },
        },
      ],
    };
    const outputs = [
      neoFileFromBytes(
        `${stem(file.name)}-spec.json`,
        new TextEncoder().encode(JSON.stringify({ target, violations, pipeline, source: target.source }, null, 2)),
        'application/json',
      ),
    ];
    if (parsed.autofix && violations.length) {
      if (isVideoFile(file)) {
        await requireFfmpeg(ctx);
        const alias = aliasOf(file, 0);
        const name = `${stem(file.name)}-fit.mp4`;
        const bytes = await encodeVideo(
          ctx,
          ['-i', alias, '-vf', scaleCropVf(target.width, target.height), '-t', String(target.maxDurationSec ?? 600), ...mp4Tail(), name],
          [{ name: alias, data: await file.bytes() }],
          name,
        );
        outputs.push(fileFromOutput(name, bytes));
      } else {
        const img = await decodeAny(file);
        const fitted = coverFit(img.data, img.width, img.height, target.width, target.height);
        outputs.push(
          await encodeNamed({ ...img, width: target.width, height: target.height, data: fitted.data }, 'jpeg', `${stem(file.name)}-fit.jpg`, 80),
        );
      }
    }
    return wrap('creator-spec-check', files, outputs, parsed, {
      violations,
      ok: violations.length === 0,
      targetId: target.id,
      pipeline,
    });
  },
});

async function collectViolations(ctx: Parameters<typeof probe>[1], file: Parameters<typeof isVideoFile>[0], target: PlatformTarget): Promise<SpecViolation[]> {
  const v: SpecViolation[] = [];
  if (isVideoFile(file)) {
    const p = await probe(file, ctx);
    const vs = p.streams.find((s) => s.type === 'video');
    const w = vs?.width ?? 0;
    const h = vs?.height ?? 0;
    if (w && h && !ratioClose(w / h, target.aspect)) {
      v.push({
        code: 'ASPECT',
        message: { de: 'Seitenverhältnis weicht ab', en: 'Aspect ratio mismatch' },
        actual: `${w}x${h}`,
        expected: `${target.width}x${target.height}`,
      });
    }
    if (w > target.width * 1.05 || h > target.height * 1.05) {
      v.push({
        code: 'SIZE',
        message: { de: 'Auflösung über dem Deckel', en: 'Resolution above cap' },
        actual: `${w}x${h}`,
        expected: `${target.width}x${target.height}`,
      });
    }
    if (target.maxDurationSec && p.duration > target.maxDurationSec + 0.15) {
      v.push({
        code: 'DURATION',
        message: { de: 'Zu lang für die Plattform', en: 'Too long for the platform' },
        actual: `${p.duration.toFixed(2)}s`,
        expected: `≤ ${target.maxDurationSec}s`,
      });
    }
  } else {
    const img = await decodeAny(file);
    if (!ratioClose(img.width / img.height, target.aspect)) {
      v.push({
        code: 'ASPECT',
        message: { de: 'Seitenverhältnis weicht ab', en: 'Aspect ratio mismatch' },
        actual: `${img.width}x${img.height}`,
        expected: `${target.width}x${target.height}`,
      });
    }
    if (img.width < target.width * 0.8 || img.height < target.height * 0.8) {
      v.push({
        code: 'UNDERSIZE',
        message: { de: 'Kleiner als empfohlen', en: 'Smaller than recommended' },
        actual: `${img.width}x${img.height}`,
        expected: `${target.width}x${target.height}`,
      });
    }
  }
  if (target.maxBytes && file.size > target.maxBytes) {
    v.push({
      code: 'BYTES',
      message: { de: 'Datei größer als Plattform-Deckel', en: 'File larger than platform cap' },
      actual: String(file.size),
      expected: String(target.maxBytes),
    });
  }
  return v;
}
