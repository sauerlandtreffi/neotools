import type { LogLevel, Platform, ToolContext } from './types.js';

const stubPlatform: Platform = {
  id: 'node',
  capabilities: { canvas: false, opfs: false, workers: false, qpdf: false, ocr: false },
};

export function createToolContext(
  partial: Partial<ToolContext> & { platform?: Platform } = {},
): ToolContext {
  return {
    progress: partial.progress ?? ((_v: number, _m?: string) => undefined),
    signal: partial.signal ?? new AbortController().signal,
    log: partial.log ?? ((_level: LogLevel, _msg: string) => undefined),
    platform: partial.platform ?? stubPlatform,
  };
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const err = new Error('Abgebrochen');
    err.name = 'AbortError';
    throw err;
  }
}
