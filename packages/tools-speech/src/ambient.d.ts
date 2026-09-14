declare module '@neotools/tools-image' {
  export function decode(input: {
    bytes: Uint8Array;
    name?: string;
    mime?: string;
  }): Promise<{ data: Uint8ClampedArray; width: number; height: number }>;
}

declare module '@neotools/parsers' {
  export function decodePngRgba(
    bytes: Uint8Array,
  ): { data: Uint8ClampedArray; width: number; height: number } | undefined;
}

declare module '@neotools/tools-media' {
  import type { NeoFile, ToolContext } from '@neotools/engine';
  export function extractAudio(
    file: NeoFile,
    opts?: { sampleRate?: number; mono?: boolean; format?: string },
    ctx?: ToolContext,
  ): Promise<NeoFile>;
}

declare module '@mlc-ai/web-llm' {
  export function CreateMLCEngine(model: string): Promise<WebLlmEngine>;
}

interface WebLlmEngine {
  chat: {
    completions: {
      create: (o: unknown) => Promise<{ choices: Array<{ message: { content: string } }> }>;
    };
  };
}

declare module 'mpg123-decoder';
declare module '@wasm-audio-decoders/mpg123';
declare module 'ogg-opus-decoder';
declare module '@wasm-audio-decoders/flac';
