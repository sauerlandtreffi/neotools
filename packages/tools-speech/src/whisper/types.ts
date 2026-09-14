import type { Transcript, TranscriptSegment, TranscriptWord } from '../captions/types.js';

export type WhisperModelId =
  | 'whisper-tiny'
  | 'whisper-base'
  | 'whisper-small'
  | 'distil-whisper-small-en'
  | 'whisper-large-v3-turbo';

export interface WhisperOptions {
  model: WhisperModelId;
  language: string;
  task: 'transcribe' | 'translate';
  wordTimestamps: boolean;
  diarize: boolean;
  confirmModelDownload: boolean;
  chunkSec: number;
  overlapSec: number;
}

export interface ChunkProgress {
  chunk: number;
  total: number;
  ratio: number;
}

export type { Transcript, TranscriptSegment, TranscriptWord };
