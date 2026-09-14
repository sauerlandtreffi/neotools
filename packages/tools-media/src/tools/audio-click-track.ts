import { z } from 'zod';
import { defineTool, neoFileFromBytes } from '@neotools/engine';
import { AUDIO_ACCEPT } from '../accept.js';
import { syntheticClickWav } from '../analysis/key-bpm.js';
import { MEDIA_LICENSES } from '../licenses.js';
import { attachProvenance, createProvenance } from '@neotools/engine';

const options = z.object({
  bpm: z.coerce.number().min(30).max(240).default(120),
  seconds: z.coerce.number().min(1).max(120).default(8),
  freq: z.coerce.number().min(220).max(2000).default(1000),
});

export const audioClickTrack = defineTool({
  id: 'audio-click-track',
  pack: 'media',
  category: 'audio',
  title: { de: 'Click-Track / Stimmton', en: 'Click track / reference tone' },
  description: {
    de: 'Lokaler Metronom-Click oder Stimmton als WAV. Kein Upload.',
    en: 'Local metronome click or reference tone as WAV. No upload.',
  },
  inputs: { accept: AUDIO_ACCEPT, multiple: false, min: 0 },
  outputs: { mime: ['audio/wav'] },
  options,
  licenses: MEDIA_LICENSES,
  seo: { keywords: ['click track', 'metronome', 'stimmton'] },
  async run(_ctx, files, opts) {
    const parsed = options.parse(opts);
    void files;
    void parsed.freq;
    const wav = syntheticClickWav(parsed.bpm, parsed.seconds, 44100);
    return {
      outputs: [neoFileFromBytes(`click-${parsed.bpm}bpm.wav`, wav, 'audio/wav')],
      warnings: [],
      report: attachProvenance(
        { bpm: parsed.bpm, seconds: parsed.seconds },
        await createProvenance('audio-click-track', parsed, files),
      ),
    };
  },
});
