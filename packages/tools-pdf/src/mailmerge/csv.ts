import { parseCsv } from './rows.js';

export { parseCsv };

export async function parseTable(name: string, bytes: Uint8Array): Promise<Record<string, string>[]> {
  if (/\.xlsx$/i.test(name)) {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(bytes, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
      if (!sheet) return [];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      return rows.map((r) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) out[String(k)] = String(v ?? '');
        return out;
      });
    } catch {
      return parseCsv(new TextDecoder().decode(bytes));
    }
  }
  return parseCsv(new TextDecoder().decode(bytes));
}
