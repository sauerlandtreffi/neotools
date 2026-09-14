import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { VIDEO_ACCEPT } from '../accept.js';
import { MEDIA_LICENSES } from '../licenses.js';
import { probe } from '../ffmpeg/probe.js';
import { runFfmpeg } from '../ffmpeg/run.js';
import { parseDetectLog } from '../ffmpeg/parse-filters.js';
import { inputAlias } from '../names.js';
import { applyVideoCutlist, cutlistOutputName } from '../video/cutlist.js';
import * as A from '../presets/args.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  windowSec: z.coerce.number().min(0.4).max(8).default(1.6),
  maxClips: z.coerce.number().min(1).max(20).default(6),
});

export const videoHighlightReel = defineTool({
  id: 'video-highlight-reel',
  pack: 'media',
  category: 'video',
  title: { de: 'Highlight-Reel', en: 'Highlight reel' },
  description: {
    de: 'Scene-Detect + Lautstärke-Spitzen → Cutlist → video-cutlist.',
    en: 'Scene detect + loudness peaks → cutlist → video-cutlist.',
  },
  inputs: { accept: VIDEO_ACCEPT, multiple: false, min: 1 },
  outputs: { mime: ['video/mp4', 'application/json'] },
  options,
  licenses: MEDIA_LICENSES,
  seo: { keywords: ['highlight reel', 'cutlist'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const file = files[0]!;
    const p = await probe(file, ctx);
    const alias = inputAlias(0, file.name);
    const data = await file.bytes();
    const det = await runFfmpeg(ctx, {
      args: A.videoDetectArgs({}, p, { inputs: [alias], output: '-' }),
      inputs: [{ name: alias, data }],
      outputs: [],
      durationHint: p.duration,
    });
    const scenes = parseDetectLog(det.log, p.duration || 1).scenes;
    const vol = await runFfmpeg(ctx, {
      args: ['-i', alias, '-af', 'silencedetect=n=-25dB:d=0.2', '-f', 'null', '-'],
      inputs: [{ name: alias, data }],
      outputs: [],
      durationHint: p.duration,
    });
    const silences = [...vol.log.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    const peaks = scenes.concat(silences.map((s) => Math.max(0, s - 0.2)));
    const keep: Array<[number, number]> = [];
    const used: number[] = [];
    for (const t of peaks.sort((a, b) => a - b)) {
      if (used.some((u) => Math.abs(u - t) < parsed.windowSec)) continue;
      const start = Math.max(0, t);
      const end = Math.min(p.duration || start + parsed.windowSec, start + parsed.windowSec);
      if (end > start + 0.2) keep.push([start, end]);
      used.push(t);
      if (keep.length >= parsed.maxClips) break;
    }
    if (!keep.length) keep.push([0, Math.min(p.duration || 2, 2)]);
    const cut = await applyVideoCutlist(ctx, file, keep, false);
    const json = new TextEncoder().encode(JSON.stringify({ keep }, null, 2));
    return {
      outputs: [
        neoFileFromBytes(cutlistOutputName(file.name), cut.bytes, 'video/mp4'),
        neoFileFromBytes('highlight-cutlist.json', json, 'application/json'),
      ],
      warnings: cut.warnings,
      report: attachProvenance({ keep, scenes: scenes.length }, await createProvenance('video-highlight-reel', parsed, files)),
    };
  },
});
