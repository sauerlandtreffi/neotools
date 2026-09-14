import { z } from 'zod';
import { zipSync } from 'fflate';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { applyTextWatermark } from '@neotools/tools-image';
import { CREATOR_CATEGORY, CREATOR_LICENSES } from '../licenses.js';
import { wrap, IMAGE_VIDEO_ACCEPT } from '../common.js';
import { DEFAULT_PACK_IDS, getTarget, targetsByIds, type PlatformTarget } from '../platform-targets.js';
import { coverFit, decodeAny, drawSafeZone, encodeNamed, isVideoFile, pngBytes, stem } from '../raster.js';
import { aliasOf, encodeVideo, fileFromOutput, mp4Tail, probe, requireFfmpeg, scaleCropVf } from '../media.js';

const options = z.object({
  targets: z.string().default(DEFAULT_PACK_IDS.join(',')),
  drawSafeZone: z.boolean().default(false),
  title: z.string().default(''),
});

export const creatorPlatformPack = defineTool({
  id: 'creator-platform-pack',
  pack: 'creator',
  category: CREATOR_CATEGORY,
  title: { de: 'Creator Platform-Pack', en: 'Creator platform pack' },
  description: {
    de: 'Ein Bild oder Video → Instagram 4:5/1:1, Reel/Story 9:16, YouTube 16:9, X, LinkedIn. Optionale Safe-Zones, harte Größen-Deckel.',
    en: 'One image or video → Instagram 4:5/1:1, Reel/Story 9:16, YouTube 16:9, X, LinkedIn. Optional safe zones, hard size caps.',
  },
  inputs: { accept: IMAGE_VIDEO_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['application/zip', 'image/jpeg', 'image/png', 'video/mp4', 'application/json'] },
  options,
  ui: { editor: 'creator-pack-preview' },
  presets: [
    { id: 'social', title: { de: 'Social-Kern', en: 'Social core' }, options: { targets: DEFAULT_PACK_IDS.join(',') } },
    { id: 'ig', title: { de: 'Nur Instagram', en: 'Instagram only' }, options: { targets: 'ig-feed-45,ig-feed-11,ig-reel,ig-story' } },
  ],
  licenses: CREATOR_LICENSES,
  seo: { keywords: ['instagram', 'youtube', 'linkedin', 'social pack'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const ids = parsed.targets.split(/[\s,]+/).filter(Boolean);
    const targets = targetsByIds(ids.length ? ids : DEFAULT_PACK_IDS);
    const video = isVideoFile(file);
    const zip: Record<string, Uint8Array> = {};
    const outputs = [];
    const manifest: Array<Record<string, unknown>> = [];
    if (video) await requireFfmpeg(ctx);
    const img = video ? null : await decodeAny(file);
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      ctx.progress((i + 1) / targets.length, t.id);
      if (video || t.kind === 'video') {
        if (!video && img) {
          const fitted = coverFit(img.data, img.width, img.height, t.width, t.height);
          let pixels = parsed.drawSafeZone ? drawSafeZone(fitted.data, t.width, t.height, t.safeZoneInset) : fitted.data;
          if (parsed.title) {
            pixels = new Uint8ClampedArray(pixels);
            await applyTextWatermark(pixels, t.width, t.height, parsed.title, {
              position: 's',
              opacity: 0.9,
              scale: 1.2,
              color: '#ffffff',
            });
          }
          const name = `${stem(file.name)}-${t.id}.jpg`;
          const out = await encodeNamed({ ...img, width: t.width, height: t.height, data: pixels }, 'jpeg', name, 85);
          let bytes = await out.bytes();
          if (t.maxBytes && bytes.byteLength > t.maxBytes) {
            const retry = await encodeNamed({ ...img, width: t.width, height: t.height, data: pixels }, 'jpeg', name, 55);
            bytes = await retry.bytes();
          }
          zip[name] = bytes;
          outputs.push(neoFileFromBytes(name, bytes, 'image/jpeg'));
          manifest.push(entry(t, name, bytes.byteLength, false));
          continue;
        }
        const alias = aliasOf(file, 0);
        const name = `${stem(file.name)}-${t.id}.mp4`;
        const vf = parsed.drawSafeZone
          ? `${scaleCropVf(t.width, t.height)},drawbox=x=${Math.round(t.width * t.safeZoneInset)}:y=${Math.round(t.height * t.safeZoneInset)}:w=${Math.round(t.width * (1 - 2 * t.safeZoneInset))}:h=${Math.round(t.height * (1 - 2 * t.safeZoneInset))}:color=green@0.4:t=2`
          : scaleCropVf(t.width, t.height);
        const bytes = await encodeVideo(
          ctx,
          ['-i', alias, '-vf', vf, ...mp4Tail(), name],
          [{ name: alias, data: await file.bytes() }],
          name,
        );
        zip[name] = bytes;
        outputs.push(fileFromOutput(name, bytes));
        const p = await probe(fileFromOutput(name, bytes), ctx);
        manifest.push(entry(t, name, bytes.byteLength, true, p.duration, p.streams.find((s) => s.type === 'video')));
      } else if (img) {
        const fitted = coverFit(img.data, img.width, img.height, t.width, t.height);
        let pixels = parsed.drawSafeZone ? drawSafeZone(fitted.data, t.width, t.height, t.safeZoneInset) : fitted.data;
        if (parsed.title) {
          pixels = new Uint8ClampedArray(pixels);
          await applyTextWatermark(pixels, t.width, t.height, parsed.title, {
            position: 's',
            opacity: 0.9,
            scale: 1.2,
            color: '#ffffff',
          });
        }
        const name = `${stem(file.name)}-${t.id}.jpg`;
        const out = await encodeNamed({ ...img, width: t.width, height: t.height, data: pixels }, 'jpeg', name, 85);
        let bytes = await out.bytes();
        if (t.maxBytes && bytes.byteLength > t.maxBytes) {
          bytes = await (await encodeNamed({ ...img, width: t.width, height: t.height, data: pixels }, 'jpeg', name, 50)).bytes();
        }
        zip[name] = bytes;
        outputs.push(neoFileFromBytes(name, bytes, 'image/jpeg'));
        manifest.push(entry(t, name, bytes.byteLength, false));
      }
    }
    const reportBytes = new TextEncoder().encode(JSON.stringify({ targets: manifest }, null, 2));
    zip['manifest.json'] = reportBytes;
    outputs.unshift(neoFileFromBytes('platform-pack.zip', zipSync(zip, { level: 6 }), 'application/zip'));
    outputs.push(neoFileFromBytes('manifest.json', reportBytes, 'application/json'));
    return wrap('creator-platform-pack', files, outputs, parsed, { files: manifest });
  },
});

function entry(
  t: PlatformTarget,
  filename: string,
  bytes: number,
  video: boolean,
  duration?: number,
  stream?: { width?: number; height?: number },
) {
  return {
    id: t.id,
    platform: t.platform,
    filename,
    width: stream?.width ?? t.width,
    height: stream?.height ?? t.height,
    bytes,
    video,
    duration,
    source: t.source,
    cap: { maxBytes: t.maxBytes, maxDurationSec: t.maxDurationSec },
  };
}

void getTarget;
void pngBytes;
