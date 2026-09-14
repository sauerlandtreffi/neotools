import { Registry } from '@neotools/engine';
import type { ToolDefinition } from '@neotools/engine';
import './models/catalog.js';
import { speechTranscribe } from './tools/speech-transcribe.js';
import { subtitlesConvert } from './tools/subtitles-convert.js';
import { subtitlesShift } from './tools/subtitles-shift.js';
import { subtitlesSnap } from './tools/subtitles-snap.js';
import { subtitlesTranslate } from './tools/subtitles-translate.js';
import { subtitlesBilingual } from './tools/subtitles-bilingual.js';
import { transcriptEdits } from './tools/transcript-edits.js';
import { transcriptChapters } from './tools/transcript-chapters.js';
import { transcriptSummary } from './tools/transcript-summary.js';
import { subtitlesOcr } from './tools/subtitles-ocr.js';
import { audioProfanityBleepList } from './tools/audio-profanity-bleep-list.js';
import { a11yAudioDescriptionDraft } from './tools/a11y-audio-description-draft.js';

export const speechTools: ToolDefinition[] = [
  speechTranscribe,
  subtitlesConvert,
  subtitlesShift,
  subtitlesSnap,
  subtitlesTranslate,
  subtitlesBilingual,
  transcriptEdits,
  transcriptChapters,
  transcriptSummary,
  subtitlesOcr,
  audioProfanityBleepList,
  a11yAudioDescriptionDraft,
];

export function registerSpeechTools(registry: Registry): Registry {
  for (const tool of speechTools) registry.register(tool);
  return registry;
}

export function createSpeechRegistry(): Registry {
  return registerSpeechTools(new Registry());
}

export {
  speechTranscribe,
  subtitlesConvert,
  subtitlesShift,
  subtitlesSnap,
  subtitlesTranslate,
  subtitlesBilingual,
  transcriptEdits,
  transcriptChapters,
  transcriptSummary,
  subtitlesOcr,
  audioProfanityBleepList,
  a11yAudioDescriptionDraft,
};

export { SPEECH_LICENSES } from './licenses.js';
export { MODEL_REGISTRY, listModels, getModel, modelsForTool, modelConfirmMessage } from './models/catalog.js';
export { decoderCoverage } from './audio/decode.js';
export {
  parseCaptions,
  writeCaptions,
  writeSrt,
  writeVtt,
  writeAss,
  shiftCues,
  stretchCues,
  convertCueFramerate,
  snapCues,
  rmsCurve,
} from './captions/index.js';
export { buildCutlist } from './transcript/edits.js';
export { chaptersFromEmbeddings } from './transcript/chapters.js';
export { clusterSpeakerVectors } from './whisper/diarize.js';
export { parseWav, writeWavPcm16 } from './audio/wav.js';
export { buildBleepList } from './transcript/bleep.js';
