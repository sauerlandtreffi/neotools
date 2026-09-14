import type { BatchFileResult, NeoFile } from './types.js';

export interface MappedFile<T> {
  file: NeoFile;
  value: T;
}

export interface MapFilesResult<T> {
  ok: MappedFile<T>[];
  errors: BatchFileResult[];
  protocol: BatchFileResult[];
}

function reasonOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Processes each input independently. A single failure never aborts the batch.
 */
export async function mapFiles<T>(
  files: NeoFile[],
  fn: (file: NeoFile, index: number) => Promise<T>,
): Promise<MapFilesResult<T>> {
  const ok: MappedFile<T>[] = [];
  const errors: BatchFileResult[] = [];
  const protocol: BatchFileResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    try {
      const value = await fn(file, i);
      ok.push({ file, value });
      protocol.push({ file: file.name, status: 'ok' });
    } catch (err) {
      const row: BatchFileResult = { file: file.name, status: 'error', reason: reasonOf(err) };
      errors.push(row);
      protocol.push(row);
    }
  }

  return { ok, errors, protocol };
}

export function mergeBatchReports(
  ...protocols: BatchFileResult[][]
): BatchFileResult[] {
  return protocols.flat();
}
