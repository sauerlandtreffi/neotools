import { z } from 'zod';
import { defineTool } from '@neotools/engine';
import { writeSrt, writeTxt } from '../captions/write.js';
import { draftAudioDescription, parseSceneReport } from '../transcript/ad-draft.js';
import { SPEECH_LICENSES, TRANSCRIPT_ACCEPT } from '../licenses.js';
import { loadTranscript, maybeAltText, pickJsonFiles, provenanceReport, stem, textFile } from './common.js';

const options = z.object({
  minGap: z.coerce.number().min(0.3).max(8).default(1.2),
  useAltText: z.boolean().default(true),
  confirmModelDownload: z.boolean().default(false),
});

export const a11yAudioDescriptionDraft = defineTool({
  id: 'a11y-audio-description-draft',
  pack: 'a11y',
  category: 'speech',
  title: { de: 'Audiodeskription-Entwurf', en: 'Audio description draft' },
  description: {
    de: 'Aus video-detect-Szenen + Transkript-Lücken Platzhalter-Cues. Optional Alt-Text aus Frames (image-alt-text).',
    en: 'Placeholder cues from video-detect scenes + transcript gaps. Optional alt text from frames (image-alt-text).',
  },
  inputs: {
    accept: [...TRANSCRIPT_ACCEPT, 'application/json', 'image/png', 'image/jpeg', '.json', '.png', '.jpg'],
    multiple: true,
    min: 1,
  },
  outputs: { mime: ['application/x-subrip', 'text/plain'] },
  options,
  licenses: SPEECH_LICENSES,
  seo: { keywords: ['audiodeskription', 'a11y', 'ad draft'] },
  async run(ctx, files, opts) {
    const parsed = options.parse(opts);
    const jsons = pickJsonFiles(files);
    let transcriptFile = files.find((f) => /\.(json|srt|vtt|txt)$/i.test(f.name) && !/detect|scene/i.test(f.name));
    const sceneFile = jsons.find((f) => /detect|scene|cut/i.test(f.name)) ?? jsons.find((f) => f !== transcriptFile);
    if (!transcriptFile) transcriptFile = jsons[0];
    if (!transcriptFile) throw new Error('Transkript fehlt.');
    const t = await loadTranscript(transcriptFile);
    let scenes = sceneFile && sceneFile !== transcriptFile
      ? parseSceneReport(JSON.parse(new TextDecoder().decode(await sceneFile.bytes())))
      : [];
    if (!scenes.length && sceneFile === transcriptFile) {
      try {
        scenes = parseSceneReport(JSON.parse(new TextDecoder().decode(await sceneFile.bytes())));
      } catch {
        scenes = [];
      }
    }
    const cues = draftAudioDescription(scenes, t, parsed.minGap);
    const frames = files.filter((f) => f.mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name));
    if (parsed.useAltText && frames.length) {
      for (let i = 0; i < Math.min(frames.length, cues.length); i++) {
        const alt = await maybeAltText(frames[i]!, ctx, parsed.confirmModelDownload);
        if (alt && cues[i]) cues[i] = { ...cues[i]!, text: `${cues[i]!.text} ${alt}` };
      }
    }
    const base = stem(transcriptFile.name);
    return {
      outputs: [
        textFile(`${base}-ad.srt`, writeSrt(cues), 'application/x-subrip'),
        textFile(`${base}-ad.txt`, writeTxt(cues), 'text/plain'),
      ],
      warnings: [],
      report: await provenanceReport('a11y-audio-description-draft', parsed, files, {
        cues: cues.length,
        videoDetect: 'Media-Pack video-detect / video-scene-detect JSON',
      }),
    };
  },
});
