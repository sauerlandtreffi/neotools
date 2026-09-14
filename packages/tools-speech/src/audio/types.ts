export interface AudioSource {
  sampleRate: number;
  channels: number;
  /** Interleaved PCM if channels > 1, otherwise mono. */
  samples: Float32Array;
  duration: number;
  format: string;
}

export interface DecodeOptions {
  sampleRate?: number;
  mono?: boolean;
}

export const TARGET_WHISPER: DecodeOptions = { sampleRate: 16000, mono: true };

export function toMono(src: AudioSource): AudioSource {
  if (src.channels <= 1) return src;
  const n = Math.floor(src.samples.length / src.channels);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < src.channels; c++) acc += src.samples[i * src.channels + c] ?? 0;
    samples[i] = acc / src.channels;
  }
  return { ...src, channels: 1, samples, duration: n / src.sampleRate };
}

export function resampleLinear(src: AudioSource, targetRate: number): AudioSource {
  if (src.sampleRate === targetRate) return src;
  const ch = src.channels;
  const inFrames = Math.floor(src.samples.length / ch);
  const outFrames = Math.max(1, Math.round((inFrames * targetRate) / src.sampleRate));
  const out = new Float32Array(outFrames * ch);
  const ratio = src.sampleRate / targetRate;
  for (let i = 0; i < outFrames; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(inFrames - 1, i0 + 1);
    const t = pos - i0;
    for (let c = 0; c < ch; c++) {
      const a = src.samples[i0 * ch + c] ?? 0;
      const b = src.samples[i1 * ch + c] ?? 0;
      out[i * ch + c] = a + (b - a) * t;
    }
  }
  return { ...src, sampleRate: targetRate, samples: out, duration: outFrames / targetRate };
}

export function normalizeAudio(src: AudioSource, opts: DecodeOptions = TARGET_WHISPER): AudioSource {
  let next = src;
  if (opts.mono !== false) next = toMono(next);
  if (opts.sampleRate) next = resampleLinear(next, opts.sampleRate);
  return next;
}
