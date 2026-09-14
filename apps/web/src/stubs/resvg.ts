/** Browser/SSR stub: SVG rasterization uses the DOM path, not the native Node binary. */
export class Resvg {
  constructor() {
    throw new Error('SVG-Raster im Web-Build ohne natives @resvg/resvg-js.');
  }
  render(): never {
    throw new Error('SVG-Raster im Web-Build ohne natives @resvg/resvg-js.');
  }
}
