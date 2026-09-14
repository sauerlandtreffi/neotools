export interface HistoryBlobRef {
  name: string;
  mime: string;
  size: number;
  sha256: string;
  stored: boolean;
  key: string;
}

export interface HistoryRecord {
  id: string;
  toolId: string;
  options: unknown;
  createdAt: number;
  expiresAt: number;
  keepInputs: boolean;
  inputs: HistoryBlobRef[];
  outputs: HistoryBlobRef[];
  report?: Record<string, unknown>;
  verification?: unknown;
  provenance?: unknown;
}

export interface HistorySettings {
  keepInputs: boolean;
  ttlMs: number;
  maxBytes: number;
}

export const DEFAULT_HISTORY_SETTINGS: HistorySettings = {
  keepInputs: true,
  ttlMs: 24 * 60 * 60 * 1000,
  maxBytes: 200 * 1024 * 1024,
};

export interface HistoryFile {
  name: string;
  mime: string;
  data: Uint8Array;
}

export interface HistoryBlobStore {
  write(key: string, data: Uint8Array): Promise<void>;
  read(key: string): Promise<Uint8Array | undefined>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
  clear(): Promise<void>;
}

export interface HistoryMetaStore {
  put(record: HistoryRecord): Promise<void>;
  get(id: string): Promise<HistoryRecord | undefined>;
  all(): Promise<HistoryRecord[]>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  getSettings(): Promise<HistorySettings>;
  setSettings(settings: HistorySettings): Promise<void>;
}

export interface JournalLine {
  id: string;
  toolId: string;
  createdAt: string;
  expiresAt: string;
  options: unknown;
  inputHashes: string[];
  outputHashes: string[];
  verification?: unknown;
  provenance?: unknown;
}
