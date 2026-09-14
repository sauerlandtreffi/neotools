declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: unknown;
}

declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' {
  export const WorkerMessageHandler: unknown;
}

declare module '@napi-rs/canvas' {
  export function createCanvas(width: number, height: number): {
    getContext(type: '2d'): unknown;
    toBuffer(mime: string, quality?: number): Buffer;
    convertToBlob?: (o: { type: string; quality?: number }) => Promise<Blob>;
  };
}
