import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface JournalEntry {
  hash: string;
  path: string;
  processedAt: string;
  status: 'ok' | 'error' | 'skipped';
  error?: string;
}

export class WatchJournal {
  private entries = new Map<string, JournalEntry>();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const text = await readFile(this.filePath, 'utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as JournalEntry;
        if (row.hash) this.entries.set(row.hash, row);
      }
    } catch {
      this.entries.clear();
    }
  }

  has(hash: string): boolean {
    return this.entries.has(hash);
  }

  get(hash: string): JournalEntry | undefined {
    return this.entries.get(hash);
  }

  async record(entry: JournalEntry): Promise<void> {
    this.entries.set(entry.hash, entry);
    await mkdir(dirname(this.filePath), { recursive: true });
    const body = [...this.entries.values()].map((e) => JSON.stringify(e)).join('\n') + '\n';
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, body);
    await rename(tmp, this.filePath);
  }
}

export function fileHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function defaultJournalPath(outDir: string): string {
  return join(outDir, '.neotools-watch.jsonl');
}
