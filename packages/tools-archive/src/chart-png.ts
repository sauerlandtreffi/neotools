/** Minimal uncompressed RGB PNG (no deps). */

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcSrc = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcSrc));
  return out;
}

function deflateStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += 65535) {
    const slice = data.subarray(i, Math.min(i + 65535, data.length));
    const last = i + 65535 >= data.length ? 1 : 0;
    const block = new Uint8Array(5 + slice.length);
    block[0] = last;
    block[1] = slice.length & 0xff;
    block[2] = slice.length >> 8;
    block[3] = ~slice.length & 0xff;
    block[4] = (~slice.length >> 8) & 0xff;
    block.set(slice, 5);
    blocks.push(block);
  }
  const body = new Uint8Array(blocks.reduce((s, b) => s + b.length, 0));
  let o = 0;
  for (const b of blocks) {
    body.set(b, o);
    o += b.length;
  }
  const cmf = 0x78;
  const flg = 1;
  const adler = adler32(data);
  const out = new Uint8Array(2 + body.length + 4);
  out[0] = cmf;
  out[1] = flg;
  out.set(body, 2);
  const v = new DataView(out.buffer);
  v.setUint32(out.length - 4, adler);
  return out;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const x of data) {
    a = (a + x) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

export function barsPng(labels: string[], values: number[], width = 480, height = 240): Uint8Array {
  const rgb = new Uint8Array((width + 1) * height);
  const max = Math.max(1, ...values);
  rgb.fill(245);
  for (let y = 0; y < height; y++) rgb[y * (width + 1)] = 0;
  const n = Math.max(1, values.length);
  const barW = Math.max(4, Math.floor(width / (n * 2)));
  values.forEach((v, i) => {
    const h = Math.round((v / max) * (height - 16));
    const x0 = 20 + i * (barW + 12);
    for (let y = height - 8; y > height - 8 - h; y--) {
      for (let x = x0; x < x0 + barW && x < width; x++) {
        const o = y * (width + 1) + 1 + x;
        rgb[o] = 40;
      }
    }
  });
  void labels;
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = chunk('IDAT', deflateStore(rgb));
  const iend = chunk('IEND', new Uint8Array(0));
  const ih = chunk('IHDR', ihdr);
  const out = new Uint8Array(sig.length + ih.length + idat.length + iend.length);
  out.set(sig, 0);
  out.set(ih, sig.length);
  out.set(idat, sig.length + ih.length);
  out.set(iend, sig.length + ih.length + idat.length);
  return out;
}
