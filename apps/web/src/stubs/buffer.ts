/** Browser stub for Node `buffer` used by optional native paths. */
export class Buffer {
  static from(input: ArrayLike<number> | ArrayBuffer | string, encoding?: string): Uint8Array {
    if (typeof input === 'string') {
      const bytes =
        encoding === 'hex'
          ? Uint8Array.from(input.match(/.{1,2}/g)?.map((h) => Number.parseInt(h, 16)) ?? [])
          : new TextEncoder().encode(input);
      return new Uint8Array(bytes);
    }
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    return input instanceof Uint8Array ? new Uint8Array(input) : Uint8Array.from(input);
  }
  static alloc(size: number): Uint8Array {
    return new Uint8Array(size);
  }
  static allocUnsafe(size: number): Uint8Array {
    return new Uint8Array(size);
  }
  static concat(list: Uint8Array[]): Uint8Array {
    const total = list.reduce((n, b) => n + b.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const b of list) {
      out.set(b, offset);
      offset += b.byteLength;
    }
    return out;
  }
}
export default { Buffer };
