export interface PdfSignatureBox {
  byteRange: [number, number, number, number];
  contents: Uint8Array;
  contentsAbsStart: number;
  contentsAbsEnd: number;
  incrementalAfter: boolean;
}

function indexOf(bytes: Uint8Array, needle: string, from = 0): number {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = from; i <= bytes.length - n.length; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return i;
  }
  return -1;
}

function parseInts(slice: string): number[] {
  return (slice.match(/\d+/g) ?? []).map((s) => Number(s));
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[\s\r\n]/g, '');
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function findPdfSignatures(bytes: Uint8Array): PdfSignatureBox[] {
  const out: PdfSignatureBox[] = [];
  let from = 0;
  for (;;) {
    const br = indexOf(bytes, '/ByteRange', from);
    if (br < 0) break;
    const open = bytes.indexOf(0x5b, br);
    const close = bytes.indexOf(0x5d, open);
    if (open < 0 || close < 0) break;
    const nums = parseInts(new TextDecoder('latin1').decode(bytes.subarray(open, close + 1)));
    if (nums.length < 4) {
      from = br + 10;
      continue;
    }
    const byteRange: [number, number, number, number] = [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
    const cpos = indexOf(bytes, '/Contents', br);
    let lt = -1;
    let gt = -1;
    if (cpos >= 0) {
      let i = cpos + '/Contents'.length;
      while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) {
        i += 1;
      }
      if (bytes[i] === 0x3c) {
        lt = i;
        gt = bytes.indexOf(0x3e, lt + 1);
      }
    }
    let contents: Uint8Array = new Uint8Array();
    let contentsAbsStart = byteRange[1];
    let contentsAbsEnd = byteRange[2];
    if (lt >= 0 && gt > lt) {
      contents = hexToBytes(new TextDecoder('latin1').decode(bytes.subarray(lt + 1, gt)));
      contentsAbsStart = lt;
      contentsAbsEnd = gt + 1;
    }
    const covered = byteRange[2] + byteRange[3];
    out.push({
      byteRange,
      contents,
      contentsAbsStart,
      contentsAbsEnd,
      incrementalAfter: covered < bytes.length,
    });
    from = close + 1;
  }
  return out;
}
