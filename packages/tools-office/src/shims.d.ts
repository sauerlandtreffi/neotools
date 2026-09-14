declare module 'wawoff2' {
  export function compress(buffer: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
  export function decompress(buffer: Uint8Array | ArrayBuffer): Promise<Uint8Array>;
}

declare module 'fonteditor-core' {
  export const Font: {
    create(
      buffer: ArrayBuffer | Uint8Array,
      options?: {
        type?: string;
        subset?: number[];
        hinting?: boolean;
        compound2simple?: boolean;
      },
    ): {
      write(options?: { type?: string; toBuffer?: boolean }): ArrayBuffer | Uint8Array | string;
    };
  };
  export const woff2: {
    init(path?: string): Promise<unknown>;
  };
}

declare module '@pdf-lib/fontkit' {
  const fontkit: any;
  export default fontkit;
}

declare module 'opentype.js' {
  export function parse(buffer: ArrayBuffer): {
    charToGlyph?: (s: string) => { unicode?: number };
  };
  const _default: { parse?: typeof parse };
  export default _default;
}

declare module 'mammoth' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
