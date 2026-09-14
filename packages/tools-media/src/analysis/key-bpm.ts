/** Krumhansl-Kessler profiles (major / minor). */
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function rotate(profile: number[], n: number): number[] {
  return profile.map((_, i) => profile[(i - n + 12) % 12]!);
}

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] ?? 0) - ma;
    const y = (b[i] ?? 0) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function dftMag(frame: Float64Array, window: Float64Array): Float64Array {
  const n = frame.length;
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < mag.length; k++) {
    let re = 0;
    let im = 0;
    for (let t = 0; t < n; t++) {
      const v = (frame[t] ?? 0) * (window[t] ?? 1);
      const ang = (-2 * Math.PI * k * t) / n;
      re += v * Math.cos(ang);
      im += v * Math.sin(ang);
    }
    mag[k] = Math.hypot(re, im);
  }
  return mag;
}

function decodeWavPcm(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== 'RIFF') {
    const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
    return { samples: Float32Array.from(f32), sampleRate: 16000 };
  }
  const sampleRate = view.getUint32(24, true);
  const bits = view.getUint16(34, true);
  const ch = view.getUint16(22, true);
  let dataOff = 12;
  while (dataOff + 8 < bytes.byteLength) {
    const id = String.fromCharCode(bytes[dataOff]!, bytes[dataOff + 1]!, bytes[dataOff + 2]!, bytes[dataOff + 3]!);
    const size = view.getUint32(dataOff + 4, true);
    if (id === 'data') {
      const start = dataOff + 8;
      const count = Math.floor(size / (bits / 8) / ch);
      const samples = new Float32Array(count);
      if (bits === 16) {
        for (let i = 0; i < count; i++) {
          let acc = 0;
          for (let c = 0; c < ch; c++) acc += view.getInt16(start + (i * ch + c) * 2, true);
          samples[i] = acc / ch / 32768;
        }
      } else if (bits === 32) {
        for (let i = 0; i < count; i++) {
          let acc = 0;
          for (let c = 0; c < ch; c++) acc += view.getFloat32(start + (i * ch + c) * 4, true);
          samples[i] = acc / ch;
        }
      } else {
        for (let i = 0; i < count; i++) samples[i] = (bytes[start + i]! - 128) / 128;
      }
      return { samples, sampleRate };
    }
    dataOff += 8 + size + (size % 2);
  }
  return { samples: new Float32Array(), sampleRate };
}

export function analyzeKeyBpm(pcmOrWav: Uint8Array, sampleRateHint?: number): { key: string; mode: 'major' | 'minor'; bpm: number; confidence: number } {
  const decoded = decodeWavPcm(pcmOrWav);
  const samples = decoded.samples;
  const sr = sampleRateHint ?? decoded.sampleRate;
  if (samples.length < sr * 0.5) {
    return { key: 'C', mode: 'major', bpm: 0, confidence: 0 };
  }
  const hop = 1024;
  const win = 2048;
  const window = hann(win);
  const chroma = new Float64Array(12);
  const flux: number[] = [];
  let prev: Float64Array | null = null;
  for (let off = 0; off + win < samples.length; off += hop) {
    const frame = new Float64Array(win);
    for (let i = 0; i < win; i++) frame[i] = samples[off + i] ?? 0;
    const mag = dftMag(frame, window);
    let f = 0;
    if (prev) {
      for (let i = 0; i < mag.length; i++) f += Math.max(0, (mag[i] ?? 0) - (prev[i] ?? 0));
    }
    flux.push(f);
    prev = mag;
    for (let k = 1; k < mag.length; k++) {
      const freq = (k * sr) / win;
      if (freq < 50 || freq > 5000) continue;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] = (chroma[pc] ?? 0) + (mag[k] ?? 0);
    }
  }
  let best: { key: string; mode: 'major' | 'minor'; score: number } = { key: 'C', mode: 'major', score: -1 };
  for (let i = 0; i < 12; i++) {
    const maj = corr([...chroma], rotate(MAJOR, i));
    const min = corr([...chroma], rotate(MINOR, i));
    if (maj > best.score) best = { key: NAMES[i]!, mode: 'major', score: maj };
    if (min > best.score) best = { key: NAMES[i]!, mode: 'minor', score: min };
  }
  const env = flux.map((v, i, arr) => {
    const a = arr[i - 1] ?? v;
    const b = arr[i + 1] ?? v;
    return (a + v + b) / 3;
  });
  const mean = env.reduce((s, v) => s + v, 0) / Math.max(env.length, 1);
  const peaks: number[] = [];
  for (let i = 1; i < env.length - 1; i++) {
    if ((env[i] ?? 0) > mean * 1.2 && (env[i] ?? 0) >= (env[i - 1] ?? 0) && (env[i] ?? 0) >= (env[i + 1] ?? 0)) {
      peaks.push(i);
    }
  }
  const hopSec = hop / sr;
  const minLag = Math.round(60 / 180 / hopSec);
  const maxLag = Math.round(60 / 60 / hopSec);
  const acAt = (lag: number): number => {
    let ac = 0;
    for (let i = 0; i + lag < env.length; i++) ac += (env[i] ?? 0) * (env[i + lag] ?? 0);
    return ac;
  };
  let bestLag = minLag;
  let bestAc = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const ac = acAt(lag);
    if (ac > bestAc) {
      bestAc = ac;
      bestLag = lag;
    }
  }
  const y0 = acAt(Math.max(minLag, bestLag - 1));
  const y1 = bestAc;
  const y2 = acAt(bestLag + 1);
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (y0 - y2) / (2 * denom) : 0;
  const lagSec = (bestLag + shift) * hopSec;
  const bpm = lagSec > 0 ? 60 / lagSec : 0;
  return {
    key: `${best.key} ${best.mode === 'major' ? 'Dur' : 'Moll'}`,
    mode: best.mode,
    bpm: Number(bpm.toFixed(2)),
    confidence: Math.max(0, Math.min(1, best.score)),
  };
}

/** Synthetisches Click-Pattern für Tests (Default 120 BPM). */
export function syntheticClickWav(bpm = 120, seconds = 4, sampleRate = 44100): Uint8Array {
  const n = sampleRate * seconds;
  const interval = Math.round((60 / bpm) * sampleRate);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const phase = i % interval;
    if (phase < Math.round(sampleRate * 0.03)) {
      pcm[i] = Math.round(Math.sin((2 * Math.PI * 1000 * phase) / sampleRate) * 20000 * (1 - phase / (sampleRate * 0.03)));
    }
  }
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const v = new DataView(bytes.buffer);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.byteLength, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.byteLength, true);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  return bytes;
}
