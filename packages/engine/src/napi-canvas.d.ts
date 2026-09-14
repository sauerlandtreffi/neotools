declare module '@napi-rs/canvas' {
  interface NapiImageData {
    data: Uint8ClampedArray;
  }
  interface NapiContext {
    createImageData(width: number, height: number): NapiImageData;
    putImageData(data: NapiImageData, x: number, y: number): void;
  }
  interface NapiCanvas {
    getContext(type: '2d'): NapiContext;
    toBuffer(mime: string, quality?: number): Buffer;
  }
  export function createCanvas(width: number, height: number): NapiCanvas;
}
