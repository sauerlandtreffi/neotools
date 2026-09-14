import { z } from 'zod';
import { definePresetTool } from '../presets/define-preset-tool.js';
import { VIDEO_ACCEPT } from '../accept.js';
import { outName } from '../names.js';

const options = z.object({
  yaw: z.coerce.number().min(-180).max(180).default(0),
  pitch: z.coerce.number().min(-90).max(90).default(0),
  fov: z.coerce.number().min(30).max(150).default(90),
});

export const video360Reframe = definePresetTool({
  id: 'video-360-reframe',
  category: 'video',
  title: { de: '360-Video reframen', en: 'Reframe 360 video' },
  description: {
    de: 'Equirectangular → Rectilinear via v360 (LGPL). yaw/pitch/fov.',
    en: 'Equirectangular → rectilinear via v360 (LGPL). yaw/pitch/fov.',
  },
  inputs: { accept: VIDEO_ACCEPT, multiple: false, min: 1 },
  options,
  ffmpeg: (opts, _p, io) => [
    '-i',
    io.inputs[0]!,
    '-vf',
    `v360=e:yaw=${opts.yaw}:pitch=${opts.pitch}:h_fov=${opts.fov}:v_fov=${Math.round(opts.fov * 0.75)}`,
    '-c:v',
    'mpeg4',
    '-q:v',
    '5',
    io.output,
  ],
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});
