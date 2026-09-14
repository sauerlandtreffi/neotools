declare module '@jspawn/qpdf-wasm' {
  export interface QpdfFs {
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string): Uint8Array;
    unlink(path: string): void;
  }

  export interface QpdfModule {
    FS: QpdfFs;
    callMain(args: string[]): number | void;
  }

  export default function createModule(opts?: Record<string, unknown>): Promise<QpdfModule>;
}
