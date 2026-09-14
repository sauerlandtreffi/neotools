import { appendFileSync } from 'node:fs';

export interface AuditLine {
  ts: string;
  jobId: string;
  toolId: string;
  optionKeys: string[];
  inputHashes: string[];
  bytesIn: number;
  durationMs: number;
  status: 'ok' | 'error' | 'denied';
}

export function writeAudit(path: string | undefined, line: AuditLine): void {
  const json = `${JSON.stringify(line)}\n`;
  if (path) {
    try {
      appendFileSync(path, json);
      return;
    } catch {
      // fall through
    }
  }
  process.stderr.write(`[audit] ${json}`);
}
