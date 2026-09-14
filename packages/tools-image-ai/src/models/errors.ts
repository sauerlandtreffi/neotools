import type { ModelEntry } from './schema.js';
import { modelConfirmMessage } from './catalog.js';

export class ModelMissingError extends Error {
  readonly code = 'MODEL_MISSING';
  readonly modelId: string;
  readonly sizeBytes: number;
  readonly license: string;
  readonly needsConfirm: boolean;

  constructor(entry: ModelEntry, needsConfirm: boolean, extra?: string) {
    const msg = `${modelConfirmMessage(entry, 'de')}${extra ? ` ${extra}` : ''}`;
    super(msg);
    this.name = 'ModelMissingError';
    this.modelId = entry.id;
    this.sizeBytes = entry.sizeBytes;
    this.license = entry.license;
    this.needsConfirm = needsConfirm;
  }
}

export function isModelMissing(err: unknown): err is ModelMissingError {
  return err instanceof ModelMissingError || (err instanceof Error && (err as { code?: string }).code === 'MODEL_MISSING');
}
