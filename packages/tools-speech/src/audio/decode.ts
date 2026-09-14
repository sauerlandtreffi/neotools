import type { NeoFile, ToolContext } from '@neotools/engine';
import { FFMPEG_HINT, isVideoName, tryExtractAudio } from './ffmpeg-bridge.js';
import { normalizeAudio, TARGET_WHISPER, type AudioSource, type DecodeOptions } from './types.js';
import { isWav, parseWav } from './wav.js';

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function decodeBrowser(bytes: Uint8Array, opts: DecodeOptions): Promise<AudioSource | null> {
  const AC =
    (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(asBuffer(bytes));
    const channels = buf.numberOfChannels;
    const frames = buf.length;
    const interleaved = new Float32Array(frames * channels);
    for (let c = 0; c < channels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < frames; i++) interleaved[i * channels + c] = ch[i] ?? 0;
    }
    return normalizeAudio(
      {
        sampleRate: buf.sampleRate,
        channels,
        samples: interleaved,
        duration: buf.duration,
        format: 'audiocontext',
      },
      opts,
    );
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function fromChannelData(
  channelData: Float32Array[],
  sampleRate: number,
  format: string,
  opts: DecodeOptions,
): AudioSource {
  const channels = Math.max(1, channelData.length);
  const frames = channelData[0]?.length ?? 0;
  const interleaved = new Float32Array(frames * channels);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) interleaved[i * channels + c] = channelData[c]?.[i] ?? 0;
  }
  return normalizeAudio({ sampleRate, channels, samples: interleaved, duration: frames / sampleRate, format }, opts);
}

async function decodeMp3(bytes: Uint8Array, opts: DecodeOptions): Promise<AudioSource> {
  try {
    const mod = (await import('mpg123-decoder')) as {
      MPEGDecoder?: new () => {
        ready: Promise<void>;
        decode: (b: Uint8Array) => { channelData: Float32Array[]; sampleRate: number };
        free?: () => void;
      };
      default?: new () => {
        ready: Promise<void>;
        decode: (b: Uint8Array) => { channelData: Float32Array[]; sampleRate: number };
        free?: () => void;
      };
    };
    const Ctor = mod.MPEGDecoder ?? mod.default;
    if (!Ctor) throw new Error('mpg123-decoder ohne MPEGDecoder');
    const dec = new Ctor();
    await dec.ready;
    const out = dec.decode(bytes);
    dec.free?.();
    return fromChannelData(out.channelData, out.sampleRate, 'mp3', opts);
  } catch {
    const mod = (await import('@wasm-audio-decoders/mpg123')) as {
      MPEGDecoder: new () => {
        ready: Promise<void>;
        decode: (b: Uint8Array) => { channelData: Float32Array[]; sampleRate: number };
        free?: () => void;
      };
    };
    const dec = new mod.MPEGDecoder();
    await dec.ready;
    const out = dec.decode(bytes);
    dec.free?.();
    return fromChannelData(out.channelData, out.sampleRate, 'mp3', opts);
  }
}

async function decodeOpus(bytes: Uint8Array, opts: DecodeOptions): Promise<AudioSource> {
  const mod = (await import('ogg-opus-decoder')) as {
    OggOpusDecoder: new () => {
      ready: Promise<void>;
      decodeFile: (b: Uint8Array) => Promise<{ channelData: Float32Array[]; sampleRate: number }>;
      free?: () => void;
    };
  };
  const dec = new mod.OggOpusDecoder();
  await dec.ready;
  const out = await dec.decodeFile(bytes);
  dec.free?.();
  return fromChannelData(out.channelData, out.sampleRate, 'opus', opts);
}

async function decodeFlac(bytes: Uint8Array, opts: DecodeOptions): Promise<AudioSource> {
  const mod = (await import('@wasm-audio-decoders/flac')) as {
    FLACDecoder: new () => {
      ready: Promise<void>;
      decodeFile?: (b: Uint8Array) => Promise<{ channelData: Float32Array[]; sampleRate: number }>;
      decode?: (b: Uint8Array) => { channelData: Float32Array[]; sampleRate: number };
      free?: () => void;
    };
  };
  const dec = new mod.FLACDecoder();
  await dec.ready;
  const out = dec.decodeFile ? await dec.decodeFile(bytes) : dec.decode!(bytes);
  dec.free?.();
  return fromChannelData(out.channelData, out.sampleRate, 'flac', opts);
}

export async function decodeAudio(
  file: NeoFile,
  ctx: ToolContext,
  opts: DecodeOptions = TARGET_WHISPER,
): Promise<AudioSource> {
  ctx.signal.throwIfAborted?.();
  const bytes = await file.bytes();
  const ext = extOf(file.name);
  const mime = file.mime.toLowerCase();

  if (isWav(bytes) || ext === '.wav' || ext === '.wave' || mime.includes('wav')) {
    return parseWav(bytes, opts);
  }
  if (ext === '.pcm') {
    const samples = new Float32Array(Math.floor(bytes.byteLength / 2));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    return normalizeAudio(
      { sampleRate: 16000, channels: 1, samples, duration: samples.length / 16000, format: 'pcm' },
      opts,
    );
  }

  if (isVideoName(file.name, file.mime) && ctx.platform.id === 'node') {
    const extracted = await tryExtractAudio(file, opts, ctx);
    if (extracted) return extracted;
    throw new Error(FFMPEG_HINT);
  }

  const browser = await decodeBrowser(bytes, opts);
  if (browser) return browser;

  if (ext === '.mp3' || mime.includes('mpeg') || mime.includes('mp3')) {
    return decodeMp3(bytes, opts);
  }
  if (ext === '.ogg' || ext === '.opus' || mime.includes('ogg') || mime.includes('opus')) {
    return decodeOpus(bytes, opts);
  }
  if (ext === '.flac' || mime.includes('flac')) {
    return decodeFlac(bytes, opts);
  }

  if (isVideoName(file.name, file.mime)) {
    const extracted = await tryExtractAudio(file, opts, ctx);
    if (extracted) return extracted;
    throw new Error(
      ctx.platform.id === 'browser'
        ? 'Browser konnte die Audiospur nicht dekodieren (AudioContext.decodeAudioData).'
        : FFMPEG_HINT,
    );
  }

  throw new Error(`Kein Decoder für ${file.name} (${file.mime}). Unterstützt ohne FFmpeg: WAV/PCM, MP3, OGG/Opus, FLAC.`);
}

export function decoderCoverage(): Record<string, string> {
  return {
    wav: 'eigener RIFF/PCM-Parser (8/16/24/32-bit, float32)',
    pcm: 'rohes PCM16 LE, 16 kHz Mono angenommen',
    mp3: 'mpg123-decoder oder @wasm-audio-decoders/mpg123 (MIT)',
    ogg_opus: 'ogg-opus-decoder (MIT)',
    flac: '@wasm-audio-decoders/flac (MIT)',
    browser: 'AudioContext.decodeAudioData (MP4/M4A/WebM inkl. Videospur)',
    node_video: 'Hinweis + optionaler dynamischer Import @neotools/tools-media extractAudio',
  };
}
