export type StreamKind = 'video' | 'audio' | 'subtitle' | 'attachment' | 'data' | 'unknown';

export interface ProbeStream {
  index: number;
  type: StreamKind;
  codec?: string;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;
  channels?: number;
  bitrate?: number;
  language?: string;
  rotation?: number;
}

export interface ProbeChapter {
  start: number;
  end?: number;
  title?: string;
}

export interface ProbeAttachment {
  name: string;
  mime?: string;
}

export interface ProbeResult {
  container: string;
  duration: number;
  bitrate?: number;
  streams: ProbeStream[];
  rotation?: number;
  hdr: boolean;
  chapters: ProbeChapter[];
  attachments: ProbeAttachment[];
  rawLog?: string;
}

export interface FfmpegInput {
  name: string;
  data: Uint8Array;
}

export interface FfmpegRunRequest {
  args: string[];
  inputs: FfmpegInput[];
  outputs: string[];
  /** Collect extra files matching this prefix (e.g. `seg_`). */
  outputPrefix?: string;
  durationHint?: number;
  cwdExtra?: Record<string, Uint8Array>;
}

export interface FfmpegRunResult {
  files: Record<string, Uint8Array>;
  log: string;
  backend: 'native' | 'wasm';
}

export interface ExtractAudioOptions {
  sampleRate?: number;
  mono?: boolean;
  format?: 'wav' | 'pcm_f32';
}

export interface MediaCapabilities {
  native: boolean;
  wasm: boolean;
  webcodecsH264: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  ffmpegNative: boolean;
}
