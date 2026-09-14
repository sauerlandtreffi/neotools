export function createCanvas(_width: number, _height: number): never {
  throw new Error('pdf-to-images in Node braucht @napi-rs/canvas — im Browser gilt OffscreenCanvas.');
}
