import { eqAt, latin1, readU16BE, readU32BE } from '../util/bytes.js';

export interface Id3Frame {
  id: string;
  size: number;
  offset: number;
  preview?: string;
}

export interface Mp3Autopsy {
  id3?: { version: string; size: number; frames: Id3Frame[] };
  mpeg?: { version: number; layer: number; bitrate: number; sampleRate: number; channelMode: number };
  xing?: { frames?: number; bytes?: number; lame?: boolean };
}

function syncsafe(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! & 0x7f) << 21) | ((bytes[offset + 1]! & 0x7f) << 14) | ((bytes[offset + 2]! & 0x7f) << 7) | (bytes[offset + 3]! & 0x7f);
}

export function parseMp3(bytes: Uint8Array): Mp3Autopsy | undefined {
  const out: Mp3Autopsy = {};
  let pos = 0;
  if (eqAt(bytes, 0, 'ID3')) {
    const ver = `${bytes[3]}.${bytes[4]}`;
    const size = syncsafe(bytes, 6);
    const frames: Id3Frame[] = [];
    let i = 10;
    const end = Math.min(bytes.length, 10 + size);
    while (i + 10 <= end) {
      const id = latin1(bytes, i, 4);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const fs = bytes[3] === 4 ? syncsafe(bytes, i + 4) : readU32BE(bytes, i + 4);
      if (fs < 0 || i + 10 + fs > end + 10) break;
      const data = bytes.subarray(i + 10, i + 10 + Math.min(fs, 80));
      let preview: string | undefined;
      if (id.startsWith('T') && data.length > 1) {
        preview = new TextDecoder(data[0] === 1 ? 'utf-16le' : 'latin1').decode(data.subarray(1)).replace(/\0/g, '').trim();
      }
      frames.push({ id, size: fs, offset: i, preview });
      i += 10 + fs;
      if (frames.length > 64) break;
    }
    out.id3 = { version: ver, size: 10 + size, frames };
    pos = 10 + size;
  }
  while (pos < bytes.length - 4 && bytes[pos] !== 0xff) pos += 1;
  if (pos < bytes.length - 3 && bytes[pos] === 0xff && (bytes[pos + 1]! & 0xe0) === 0xe0) {
    const b1 = bytes[pos + 1]!;
    const b2 = bytes[pos + 2]!;
    const versionBits = (b1 >> 3) & 3;
    const layerBits = (b1 >> 1) & 3;
    const bitrateIdx = (b2 >> 4) & 15;
    const srIdx = (b2 >> 2) & 3;
    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 0;
    const layer = layerBits === 1 ? 3 : layerBits === 2 ? 2 : layerBits === 3 ? 1 : 0;
    const brTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const srTable = [44100, 48000, 32000, 0];
    out.mpeg = {
      version,
      layer,
      bitrate: brTable[bitrateIdx] ?? 0,
      sampleRate: srTable[srIdx] ?? 0,
      channelMode: (bytes[pos + 3]! >> 6) & 3,
    };
    const side = version === 1 ? 36 : 21;
    const xingOff = pos + 4 + side;
    if (eqAt(bytes, xingOff, 'Xing') || eqAt(bytes, xingOff, 'Info')) {
      const flags = readU32BE(bytes, xingOff + 4);
      let p = xingOff + 8;
      const xing: { frames?: number; bytes?: number; lame?: boolean } = {};
      if (flags & 1) {
        xing.frames = readU32BE(bytes, p);
        p += 4;
      }
      if (flags & 2) {
        xing.bytes = readU32BE(bytes, p);
        p += 4;
      }
      if (eqAt(bytes, xingOff + 0x78, 'LAME') || latin1(bytes, xingOff + 0x78, 4) === 'LAME') xing.lame = true;
      if (findLame(bytes, xingOff)) xing.lame = true;
      out.xing = xing;
    }
  }
  if (!out.id3 && !out.mpeg) return undefined;
  return out;
}

function findLame(bytes: Uint8Array, from: number): boolean {
  for (let i = from; i < Math.min(bytes.length - 4, from + 200); i++) {
    if (eqAt(bytes, i, 'LAME')) return true;
  }
  return false;
}

export function buildId3Mp3(): Uint8Array {
  const frameData = new Uint8Array([0x00, 0x4e, 0x65, 0x6f]); // latin1 "Neo"
  const frame = new Uint8Array(10 + frameData.length);
  frame.set([0x54, 0x49, 0x54, 0x32]); // TIT2
  frame[7] = frameData.length;
  frame.set(frameData, 10);
  const size = frame.length;
  const header = new Uint8Array(10 + size);
  header.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;
  header.set(frame, 10);
  const mpeg = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const out = new Uint8Array(header.length + mpeg.length);
  out.set(header);
  out.set(mpeg, header.length);
  return out;
}

void readU16BE;
