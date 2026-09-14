import type { Bundesland } from './holidays.js';
import { computeDeadline } from './bgb.js';

export type DateKind = 'zustellung' | 'frist' | 'termin' | 'rechnungsdatum' | 'zahlungsziel';

export interface DateHit {
  page: number;
  quote: string;
  iso?: string;
  kind: DateKind;
  relative?: { count: number; unit: 'days' | 'weeks' | 'months' };
}

const MONTHS: Record<string, string> = {
  januar: '01',
  februar: '02',
  märz: '03',
  maerz: '03',
  april: '04',
  mai: '05',
  juni: '06',
  juli: '07',
  august: '08',
  september: '09',
  oktober: '10',
  november: '11',
  dezember: '12',
};

const KIND_RULES: Array<{ re: RegExp; kind: DateKind }> = [
  { re: /zustell/i, kind: 'zustellung' },
  { re: /frist|binnen|innerhalb|spätestens/i, kind: 'frist' },
  { re: /termin|verhandlung|sitzung/i, kind: 'termin' },
  { re: /rechnungsdatum|rechnungsdatum|invoice date/i, kind: 'rechnungsdatum' },
  { re: /zahlungsziel|zahlbar|fällig/i, kind: 'zahlungsziel' },
];

function toIso(d: string, monthName?: string, year?: string): string | undefined {
  const a = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(d);
  if (a) {
    const y = a[3]!.length === 2 ? `20${a[3]}` : a[3]!;
    return `${y}-${a[2]!.padStart(2, '0')}-${a[1]!.padStart(2, '0')}`;
  }
  if (monthName && year) {
    const m = MONTHS[monthName.toLowerCase()];
    const day = /^(\d{1,2})/.exec(d)?.[1];
    if (m && day) return `${year}-${m}-${day.padStart(2, '0')}`;
  }
  return undefined;
}

export function extractDates(pages: string[]): DateHit[] {
  const hits: DateHit[] = [];
  pages.forEach((text, idx) => {
    const page = idx + 1;
    const lines = text.split(/\n/);
    for (const line of lines) {
      const kind = KIND_RULES.find((k) => k.re.test(line))?.kind ?? 'termin';
      const rel = /binnen\s+(\d+|einem|einer|zwei|drei|vier)\s+(Tage?n?|Wochen?|Monate?n?)/i.exec(line);
      const dates = [...line.matchAll(/(\d{1,2}\.\d{1,2}\.\d{2,4})/g)];
      const named = [...line.matchAll(/\b(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/gi)];
      for (const m of dates) {
        hits.push({ page, quote: line.trim().slice(0, 180), iso: toIso(m[1]!), kind });
      }
      for (const m of named) {
        hits.push({
          page,
          quote: line.trim().slice(0, 180),
          iso: toIso(m[0]!, m[2], m[3]),
          kind,
        });
      }
      if (rel) {
        const words: Record<string, number> = { einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4 };
        const n = words[rel[1]!.toLowerCase()] ?? Number(rel[1]);
        const u = /woche/i.test(rel[2]!) ? 'weeks' : /monat/i.test(rel[2]!) ? 'months' : 'days';
        hits.push({ page, quote: line.trim().slice(0, 180), kind: 'frist', relative: { count: n, unit: u } });
      }
    }
  });
  return hits;
}

export function resolveHits(hits: DateHit[], land: Bundesland): Array<DateHit & { deadline?: string }> {
  const event =
    hits.find((h) => h.kind === 'zustellung' && h.iso)?.iso ?? hits.find((h) => Boolean(h.iso))?.iso;
  return hits.map((h) => {
    if (h.relative && event) {
      const d = computeDeadline(event, h.relative.count, h.relative.unit, land);
      return { ...h, deadline: d.endWorkday, iso: h.iso ?? event };
    }
    return h;
  });
}

export function toIcs(hits: Array<DateHit & { deadline?: string }>, alarmHours: number): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NeoTools//dach-deadline//DE'];
  hits.forEach((h, i) => {
    const day = (h.deadline ?? h.iso)?.replace(/-/g, '');
    if (!day) return;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:deadline-${i}@neotools`);
    lines.push(`DTSTAMP:${day}T090000Z`);
    lines.push(`DTSTART;VALUE=DATE:${day}`);
    lines.push(`SUMMARY:${(h.kind + ' ' + (h.quote ?? '')).slice(0, 70)}`);
    lines.push(`DESCRIPTION:${h.quote ?? ''}`);
    if (alarmHours > 0) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`TRIGGER:-PT${alarmHours}H`);
      lines.push('DESCRIPTION:Frist');
      lines.push('END:VALARM');
    }
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
