import { eqAt, fourcc, readU32LE } from '../util/bytes.js';

export interface RiffChunk {
  id: string;
  offset: number;
  size: number;
}

export interface RiffAutopsy {
  form: string;
  chunks: RiffChunk[];
  wav?: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number };
}

export function parseRiff(bytes: Uint8Array): RiffAutopsy | undefined {
  if (!eqAt(bytes, 0, 'RIFF') && !eqAt(bytes, 0, 'RIFX') && !eqAt(bytes, 0, 'FORM')) return undefined;
  const form = fourcc(bytes, 8);
  const chunks: RiffChunk[] = [{ id: fourcc(bytes, 0), offset: 0, size: readU32LE(bytes, 4) }];
  let i = 12;
  while (i + 8 <= bytes.length && chunks.length < 200) {
    const id = fourcc(bytes, i);
    const size = readU32LE(bytes, i + 4);
    chunks.push({ id, offset: i, size });
    i += 8 + size + (size % 2);
  }
  let wav: RiffAutopsy['wav'];
  if (form === 'WAVE') {
    const fmt = chunks.find((c) => c.id === 'fmt ');
    if (fmt && fmt.size >= 16) {
      const p = fmt.offset + 8;
      wav = {
        audioFormat: bytes[p]! | (bytes[p + 1]! << 8),
        channels: bytes[p + 2]! | (bytes[p + 3]! << 8),
        sampleRate: readU32LE(bytes, p + 4),
        bitsPerSample: bytes[p + 14]! | (bytes[p + 15]! << 8),
      };
    }
  }
  return { form, chunks, wav };
}

export function buildMinimalWav(): Uint8Array {
  const out = new Uint8Array(44 + 8);
  out.set([0x52, 0x49, 0x46, 0x46]);
  out[4] = 44;
  out.set([0x57, 0x41, 0x56, 0x45], 8);
  out.set([0x66, 0x6d, 0x74, 0x20], 12);
  out[16] = 16;
  out[20] = 1; // PCM
  out[22] = 1; // mono
  out[24] = 0x44;
  out[25] = 0xac; // 44100
  out[34] = 16;
  out.set([0x64, 0x61, 0x74, 0x61], 36);
  out[40] = 8;
  return out;
}
