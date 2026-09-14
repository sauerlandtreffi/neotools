import type { QpdfModule } from '@jspawn/qpdf-wasm';
import { asBufferSource, copyBytes, isNodeRuntime, loadWasmBytes } from '../wasm-bytes.js';

export const QPDF_WRONG_PASSWORD = 'Falsches Passwort. / Wrong password.';

let compiled: WebAssembly.Module | null = null;
let loadError: string | null = null;

async function compileQpdf(): Promise<WebAssembly.Module> {
  if (compiled) return compiled;
  const bytes = await loadWasmBytes({
    specifier: '@jspawn/qpdf-wasm/qpdf.wasm',
    publicPath: '/assets/qpdf/qpdf.wasm',
  });
  compiled = await WebAssembly.compile(asBufferSource(bytes));
  return compiled;
}

async function createInstance(): Promise<{ qpdf: QpdfModule; stderr: string[] }> {
  const createModule = (await import('@jspawn/qpdf-wasm')).default;
  const wasm = await compileQpdf();
  const stderr: string[] = [];
  const qpdf = await createModule({
    noInitialRun: true,
    noExitRuntime: true,
    locateFile: (file: string) => (isNodeRuntime() ? file : `/assets/qpdf/${file}`),
    instantiateWasm(
      info: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance) => void,
    ) {
      void WebAssembly.instantiate(wasm, info).then((instance) => receive(instance));
      return {};
    },
    print: (s: string) => {
      stderr.push(s);
    },
    printErr: (s: string) => {
      stderr.push(s);
    },
  });
  return { qpdf, stderr };
}

export async function qpdfAvailable(): Promise<boolean> {
  if (loadError) return false;
  try {
    await compileQpdf();
    return true;
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    return false;
  }
}

export interface QpdfRunResult {
  bytes: Uint8Array;
  stderr: string;
  code: number;
}

/**
 * Run qpdf CLI on one PDF. Fresh Emscripten instance per call
 * (callMain is not reliably re-entrant on this 0.0.2 build).
 */
export async function qpdfRun(args: string[], input: Uint8Array): Promise<QpdfRunResult> {
  const { qpdf, stderr } = await createInstance();
  qpdf.FS.writeFile('/in.pdf', input);
  let code = 0;
  try {
    const raw = qpdf.callMain(args);
    if (typeof raw === 'number') code = raw;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (typeof status === 'number') code = status;
    else {
      const msg = err instanceof Error ? err.message : String(err);
      stderr.push(msg);
      code = 1;
    }
  }
  let bytes: Uint8Array = new Uint8Array();
  try {
    bytes = copyBytes(qpdf.FS.readFile('/out.pdf'));
  } catch {
    // no output
  }
  return { bytes, stderr: stderr.join('\n'), code };
}

export function isWrongPassword(stderr: string, code: number): boolean {
  const t = stderr.toLowerCase();
  return (
    t.includes('invalid password') ||
    t.includes('incorrect password') ||
    t.includes('wrong password') ||
    (code !== 0 && t.includes('password'))
  );
}

export async function qpdfEncrypt(
  input: Uint8Array,
  opts: {
    userPassword: string;
    ownerPassword: string;
    allowPrint: boolean;
    allowCopy: boolean;
    allowModify: boolean;
    allowAnnotate: boolean;
    linearize?: boolean;
  },
): Promise<Uint8Array> {
  const args = [
    ...(opts.linearize ? ['--linearize'] : []),
    '--encrypt',
    opts.userPassword,
    opts.ownerPassword,
    '256',
    `--print=${opts.allowPrint ? 'full' : 'none'}`,
    `--extract=${opts.allowCopy ? 'y' : 'n'}`,
    `--modify=${opts.allowModify ? 'all' : 'none'}`,
    `--annotate=${opts.allowAnnotate ? 'y' : 'n'}`,
    '--',
    '/in.pdf',
    '/out.pdf',
  ];
  const result = await qpdfRun(args, input);
  if (result.code !== 0 || !result.bytes.byteLength) {
    throw new Error(result.stderr || `qpdf encrypt fehlgeschlagen (exit ${result.code}).`);
  }
  return result.bytes;
}

export async function qpdfDecrypt(input: Uint8Array, password: string): Promise<Uint8Array> {
  const result = await qpdfRun(['--password=' + password, '--decrypt', '/in.pdf', '/out.pdf'], input);
  if (isWrongPassword(result.stderr, result.code) || result.code !== 0 || !result.bytes.byteLength) {
    throw new Error(QPDF_WRONG_PASSWORD);
  }
  return result.bytes;
}

export async function qpdfRewrite(
  input: Uint8Array,
  extra: string[] = [],
): Promise<Uint8Array> {
  const result = await qpdfRun([...extra, '/in.pdf', '/out.pdf'], input);
  if (result.code !== 0 || !result.bytes.byteLength) {
    throw new Error(result.stderr || `qpdf rewrite fehlgeschlagen (exit ${result.code}).`);
  }
  return result.bytes;
}

export async function cantooEncrypt(
  input: Uint8Array,
  opts: {
    userPassword: string;
    ownerPassword: string;
    allowPrint: boolean;
    allowCopy: boolean;
    allowModify: boolean;
    allowAnnotate: boolean;
  },
): Promise<Uint8Array> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.load(input);
  doc.encrypt({
    userPassword: opts.userPassword || undefined,
    ownerPassword: opts.ownerPassword || opts.userPassword || undefined,
    algorithm: 'AES-256',
    permissions: {
      printing: opts.allowPrint ? 'highResolution' : false,
      copying: opts.allowCopy,
      modifying: opts.allowModify,
      annotating: opts.allowAnnotate,
      fillingForms: opts.allowAnnotate,
      contentAccessibility: true,
      documentAssembly: opts.allowModify,
    },
  });
  return new Uint8Array(await doc.save());
}

export async function cantooDecrypt(input: Uint8Array, password: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('@cantoo/pdf-lib');
  try {
    const doc = await PDFDocument.load(input, { password });
    return new Uint8Array(await doc.save());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password|encrypt|decrypt/i.test(msg)) throw new Error(QPDF_WRONG_PASSWORD);
    throw new Error(QPDF_WRONG_PASSWORD);
  }
}

export async function encryptPdf(
  input: Uint8Array,
  opts: {
    userPassword: string;
    ownerPassword: string;
    allowPrint: boolean;
    allowCopy: boolean;
    allowModify: boolean;
    allowAnnotate: boolean;
    linearize?: boolean;
  },
): Promise<{ bytes: Uint8Array; engine: 'qpdf' | 'cantoo' }> {
  let qpdfErr = '';
  if (await qpdfAvailable()) {
    try {
      return { bytes: await qpdfEncrypt(input, opts), engine: 'qpdf' };
    } catch (err) {
      qpdfErr = err instanceof Error ? err.message : String(err);
    }
  }
  try {
    return { bytes: await cantooEncrypt(input, opts), engine: 'cantoo' };
  } catch (err) {
    const cantoo = err instanceof Error ? err.message : String(err);
    throw new Error(qpdfErr ? `qpdf: ${qpdfErr}; cantoo: ${cantoo}` : cantoo);
  }
}

export async function decryptPdf(
  input: Uint8Array,
  password: string,
): Promise<{ bytes: Uint8Array; engine: 'qpdf' | 'cantoo' }> {
  if (await qpdfAvailable()) {
    try {
      return { bytes: await qpdfDecrypt(input, password), engine: 'qpdf' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === QPDF_WRONG_PASSWORD || /password/i.test(msg)) {
        throw new Error(QPDF_WRONG_PASSWORD);
      }
    }
  }
  try {
    return { bytes: await cantooDecrypt(input, password), engine: 'cantoo' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === QPDF_WRONG_PASSWORD || /password|encrypt/i.test(msg)) {
      throw new Error(QPDF_WRONG_PASSWORD);
    }
    throw new Error(QPDF_WRONG_PASSWORD);
  }
}

/** qpdf --check (no output file). Exit 0 = structurally intact. */
export async function qpdfCheck(input: Uint8Array): Promise<{ ok: boolean; stderr: string; code: number }> {
  const { qpdf, stderr } = await createInstance();
  qpdf.FS.writeFile('/in.pdf', input);
  let code = 0;
  try {
    const raw = qpdf.callMain(['--check', '/in.pdf']);
    if (typeof raw === 'number') code = raw;
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (typeof status === 'number') code = status;
    else {
      stderr.push(err instanceof Error ? err.message : String(err));
      code = 1;
    }
  }
  return { ok: code === 0, stderr: stderr.join('\n'), code };
}
