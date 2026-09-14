import type { HistoryRecord, JournalLine } from './types';

export function toJournalLine(record: HistoryRecord): JournalLine {
  return {
    id: record.id,
    toolId: record.toolId,
    createdAt: new Date(record.createdAt).toISOString(),
    expiresAt: new Date(record.expiresAt).toISOString(),
    options: record.options,
    inputHashes: record.inputs.map((file) => file.sha256),
    outputHashes: record.outputs.map((file) => file.sha256),
    verification: record.verification,
    provenance: record.provenance,
  };
}

export function journalJsonl(records: readonly HistoryRecord[]): string {
  return records.map((record) => JSON.stringify(toJournalLine(record))).join('\n') + (records.length ? '\n' : '');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function journalCsv(records: readonly HistoryRecord[]): string {
  const header = [
    'id',
    'toolId',
    'createdAt',
    'inputHashes',
    'outputHashes',
    'options',
    'verification',
  ];
  const rows = records.map((record) => {
    const line = toJournalLine(record);
    return [
      line.id,
      line.toolId,
      line.createdAt,
      line.inputHashes.join(' '),
      line.outputHashes.join(' '),
      JSON.stringify(line.options ?? {}),
      JSON.stringify(line.verification ?? null),
    ].map(csvEscape);
  });
  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n') + '\n';
}
