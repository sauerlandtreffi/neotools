import { normalizeAudio, type AudioSource, type DecodeOptions } from './types.js';

function u16(view: DataView, o: number): number {
  return view.getUint16(o, true);
}
function u32(view: DataView, o: number): number {
  return view.getUint32(o, true);
}
function i16(view: DataView, o: number): number {
  return view.getInt16(o, true);
}

function ascii(bytes: Uint8Array, o: number, n: number): string {
  return String.fromCharCode(...bytes.subarray(o, o + n));
}

export function isWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE';
}

export function parseWav(bytes: Uint8Array, opts?: DecodeOptions): AudioSource {
  if (!isWav(bytes)) throw new Error('Keine RIFF/WAVE-Datei.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 16000;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, 4);
    const size = u32(view, offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      audioFormat = u16(view, body);
      channels = u16(view, body + 2);
      sampleRate = u32(view, body + 4);
      bitsPerSample = u16(view, body + 14);
      if (audioFormat === 0xfffe && size >= 40) {
        audioFormat = u16(view, body + 24);
      }
    } else if (id === 'data') {
      dataOffset = body;
      dataSize = size;
    }
    offset = body + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error('WAVE ohne data-Chunk.');
  const samples = decodePcm(bytes.subarray(dataOffset, dataOffset + dataSize), audioFormat, bitsPerSample);
  const src: AudioSource = {
    sampleRate,
    channels,
    samples,
    duration: samples.length / channels / sampleRate,
    format: 'wav',
  };
  return opts ? normalizeAudio(src, opts) : src;
}

function decodePcm(data: Uint8Array, format: number, bits: number): Float32Array {
  if (format === 3 && bits === 32) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const n = Math.floor(data.byteLength / 4);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true);
    return out;
  }
  if (bits === 8) {
    const out = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = ((data[i] ?? 128) - 128) / 128;
    return out;
  }
  if (bits === 16) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const n = Math.floor(data.byteLength / 2);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = i16(view, i * 2) / 32768;
    return out;
  }
  if (bits === 24) {
    const n = Math.floor(data.byteLength / 3);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      let v = (data[o] ?? 0) | ((data[o + 1] ?? 0) << 8) | ((data[o + 2] ?? 0) << 16);
      if (v & 0x800000) v |= ~0xffffff;
      out[i] = v / 8388608;
    }
    return out;
  }
  if (bits === 32 && format === 1) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const n = Math.floor(data.byteLength / 4);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = view.getInt32(i * 4, true) / 2147483648;
    return out;
  }
  throw new Error(`Nicht unterstütztes PCM-Format: format=${format} bits=${bits}`);
}

export function writeWavPcm16(samples: Float32Array, sampleRate: number, channels = 1): Uint8Array {
  const dataSize = samples.length * 2;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(v * 32767), true);
  }
  return out;
}
