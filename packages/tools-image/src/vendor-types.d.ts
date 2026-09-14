declare module 'utif' {
  export interface IFD {
    width?: number;
    height?: number;
    data?: Uint8Array;
    t256?: number[];
    t257?: number[];
    [key: string]: unknown;
  }
  export function decode(buffer: ArrayBuffer | Uint8Array): IFD[];
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: IFD): void;
  export function toRGBA8(ifd: IFD): Uint8Array;
  export function encodeImage(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, metadata?: unknown): ArrayBuffer;
  export function encode(ifds: IFD[]): ArrayBuffer;
}

declare module 'upng-js' {
  export interface Image {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames?: Array<{ delay?: number; rect?: { x: number; y: number; width: number; height: number } }>;
    tabs?: Record<string, unknown>;
    data?: ArrayBuffer;
  }
  export function decode(buffer: ArrayBuffer | Uint8Array): Image;
  export function toRGBA8(img: Image): ArrayBuffer[];
  export function encode(
    bufs: ArrayBuffer[],
    w: number,
    h: number,
    cnum?: number,
    dels?: number[],
    forbidPlte?: boolean,
  ): ArrayBuffer;
}

declare module 'gifuct-js' {
  export interface ParsedGif {
    lsd: { width: number; height: number };
    frames: unknown[];
  }
  export interface DecompressedFrame {
    dims: { width: number; height: number; top: number; left: number };
    delay: number;
    disposalType: number;
    patch: Uint8ClampedArray;
  }
  export function parseGIF(buffer: ArrayBuffer | Uint8Array): ParsedGif;
  export function decompressFrames(parsed: ParsedGif, buildPatch: boolean): DecompressedFrame[];
}

declare module 'gifenc' {
  export function GIFEncoder(opts?: { auto?: boolean }): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: number[][]; delay?: number; repeat?: number; transparent?: number; dispose?: number },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: string }): number[][];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: string,
  ): Uint8Array;
}

declare module 'heic-decode' {
  interface DecodeResult {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
  }
  function heicDecode(opts: { buffer: ArrayBuffer | Uint8Array }): Promise<DecodeResult | DecodeResult[]>;
  export default heicDecode;
}

declare module 'opentype.js' {
  export interface Path {
    commands: Array<{ type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }>;
    getBoundingBox(): { x1: number; y1: number; x2: number; y2: number };
  }
  export interface Glyph {
    getPath(x: number, y: number, fontSize: number): Path;
    advanceWidth: number;
  }
  export interface Font {
    getPath(text: string, x: number, y: number, fontSize: number): Path;
    charToGlyph(char: string): Glyph;
    unitsPerEm: number;
    names?: { fontFamily?: { en?: string } };
  }
  export function parse(buffer: ArrayBuffer): Font;
  export function load(url: string, callback: (err: Error | null, font?: Font) => void): void;
}

declare module '@resvg/resvg-js' {
  export class Resvg {
    constructor(svg: string | Uint8Array, opts?: { fitTo?: { mode: string; value: number } });
    render(): { width: number; height: number; asPng(): Uint8Array; pixels: Uint8Array };
  }
}
