import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { VIDEO_ACCEPT } from '../accept.js';
import { MEDIA_LICENSES } from '../licenses.js';
import { probe } from '../ffmpeg/probe.js';
import { runFfmpeg, requireOutput } from '../ffmpeg/run.js';
import { inputAlias, outName } from '../names.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  aspect: z.enum(['9:16', '1:1', '4:5']).default('9:16'),
  every: z.coerce.number().min(1).max(30).default(5),
});

export const videoSmartReframe = defineTool({
  id: 'video-smart-reframe',
  pack: 'media',
  category: 'video',
  title: { de: 'Talking-Head Smart-Reframe', en: 'Talking-head smart reframe' },
  description: {
    de: '9:16-Crop mit Gesichts-Tracking (YuNet/Heuristik je n-tem Frame) und crop-Filter.',
    en: '9:16 crop with face tracking (YuNet/heuristic every nth frame) and crop filter.',
  },
  inputs: { accept: VIDEO_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['video/mp4'] },
  options,
  licenses: MEDIA_LICENSES,
  seo: { keywords: ['reframe', '9:16', 'talking head'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const p = await probe(file, ctx);
    const vs = p.streams.find((s) => s.type === 'video');
    const vw = vs?.width ?? 1280;
    const vh = vs?.height ?? 720;
    const [aw, ah] = parsed.aspect.split(':').map(Number) as [number, number];
    const cropH = vh;
    const cropW = Math.min(vw, Math.round((cropH * aw) / ah));
    let cx = Math.round((vw - cropW) / 2);
    const alias = inputAlias(0, file.name);
    const raw = 'track.rgba';
    const dumped = await runFfmpeg(ctx, {
      args: ['-i', alias, '-vf', `fps=1/${parsed.every},scale=160:90,format=rgba`, '-f', 'rawvideo', raw],
      inputs: [{ name: alias, data: await file.bytes() }],
      outputs: [raw],
      durationHint: p.duration,
    });
    const rgba = dumped.files[raw];
    if (rgba) {
      const stride = 160 * 90 * 4;
      let sx = 0;
      let n = 0;
      for (let i = 0; i + stride <= rgba.length; i += stride) {
        const face = heuristicCenter(rgba.subarray(i, i + stride), 160, 90);
        sx += face;
        n++;
      }
      if (n) cx = Math.max(0, Math.min(vw - cropW, Math.round(((sx / n) / 160) * vw - cropW / 2)));
    }
    const name = outName(file.name, 'mp4');
    const result = await runFfmpeg(ctx, {
      args: ['-i', alias, '-vf', `crop=${cropW}:${cropH}:${cx}:0,scale=1080:-2`, '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', name],
      inputs: [{ name: alias, data: await file.bytes() }],
      outputs: [name],
      durationHint: p.duration,
    });
    return {
      outputs: [neoFileFromBytes(name, requireOutput(result, name), 'video/mp4')],
      warnings: [],
      report: attachProvenance({ cropW, cropH, cx, aspect: parsed.aspect }, await createProvenance('video-smart-reframe', parsed, files)),
    };
  },
});

function heuristicCenter(data: Uint8Array, w: number, h: number): number {
  let sx = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r > 95 && g > 40 && b > 20 && r > g && r - g > 15) {
        sx += x;
        n++;
      }
    }
  }
  return n ? sx / n : w / 2;
}
