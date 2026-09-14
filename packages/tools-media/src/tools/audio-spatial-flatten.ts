import { z } from 'zod';
import { definePresetTool } from '../presets/define-preset-tool.js';
import { AUDIO_ACCEPT } from '../accept.js';
import { outName } from '../names.js';

const options = z.object({
  mode: z.enum(['flatten', 'no-center']).default('flatten'),
});

export const audioSpatialFlatten = definePresetTool({
  id: 'audio-spatial-flatten',
  category: 'audio',
  title: { de: 'Spatial flatten', en: 'Spatial flatten' },
  description: {
    de: 'Mehrkanal auf Stereo falten oder Center-Kanal entfernen (pan). Kein Dolby-Decoder.',
    en: 'Fold multichannel to stereo or drop the center channel (pan). No Dolby decoder.',
  },
  inputs: { accept: AUDIO_ACCEPT, multiple: false, min: 1 },
  options,
  ffmpeg: (opts, _p, io) =>
    opts.mode === 'no-center'
      ? ['-i', io.inputs[0]!, '-af', 'pan=stereo|c0=c0|c1=c2', io.output]
      : ['-i', io.inputs[0]!, '-ac', '2', io.output],
  outputName: (_o, files) => outName(files[0]!.name, 'wav'),
});
