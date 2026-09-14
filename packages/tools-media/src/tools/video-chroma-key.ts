import { z } from 'zod';
import { definePresetTool } from '../presets/define-preset-tool.js';
import { VIDEO_ACCEPT, IMAGE_OVERLAY_ACCEPT } from '../accept.js';
import { outName } from '../names.js';

const options = z.object({
  color: z.string().default('0x00FF00'),
  similarity: z.coerce.number().min(0.01).max(1).default(0.3),
  blend: z.coerce.number().min(0).max(1).default(0.1),
  engine: z.enum(['chromakey', 'colorkey']).default('chromakey'),
});

export const videoChromaKey = definePresetTool({
  id: 'video-chroma-key',
  category: 'video',
  title: { de: 'Chroma-Key', en: 'Chroma key' },
  description: { de: 'Greenscreen: chromakey/colorkey plus optionaler Hintergrund.', en: 'Greenscreen: chromakey/colorkey plus optional background.' },
  inputs: { accept: [...VIDEO_ACCEPT, ...IMAGE_OVERLAY_ACCEPT], multiple: true, min: 1 },
  outputs: { mime: ['video/mp4'] },
  options,
  ffmpeg: (opts, _p, io) => {
    const key = `${opts.engine}=${opts.color}:${opts.similarity}:${opts.blend}`;
    if (io.inputs[1]) {
      return ['-i', io.inputs[0]!, '-i', io.inputs[1]!, '-filter_complex', `[0:v]${key}[fg];[1:v]scale=iw:ih[bg];[bg][fg]overlay`, '-c:v', 'mpeg4', '-q:v', '5', io.output];
    }
    return ['-i', io.inputs[0]!, '-vf', key, '-c:v', 'mpeg4', '-q:v', '5', io.output];
  },
  outputName: (_o, files) => outName(files[0]!.name, 'mp4'),
});
