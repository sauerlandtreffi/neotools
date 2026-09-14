export interface IcsEvent {
  uid: string;
  dtstart?: string;
  dtend?: string;
  summary?: string;
  description?: string;
  location?: string;
  tzid?: string;
  raw: Record<string, string>;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

export function parseIcs(text: string): { calendar: Record<string, string>; events: IcsEvent[]; timezones: string[] } {
  const events: IcsEvent[] = [];
  const timezones: string[] = [];
  const calendar: Record<string, string> = {};
  let mode: 'cal' | 'event' | 'tz' | null = null;
  let ev: IcsEvent | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT/i.test(line)) {
      mode = 'event';
      ev = { uid: '', raw: {} };
      continue;
    }
    if (/^END:VEVENT/i.test(line) && ev) {
      if (!ev.uid) ev.uid = `generated-${events.length}-${ev.dtstart ?? ''}-${ev.summary ?? ''}`;
      events.push(ev);
      ev = null;
      mode = 'cal';
      continue;
    }
    if (/^BEGIN:VTIMEZONE/i.test(line)) {
      mode = 'tz';
      continue;
    }
    if (/^END:VTIMEZONE/i.test(line)) {
      mode = 'cal';
      continue;
    }
    const m = /^([^:;]+)(;[^:]+)?:(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toUpperCase();
    const params = m[2] ?? '';
    const value = m[3] ?? '';
    const tz = /TZID=([^;:]+)/i.exec(params)?.[1];
    if (tz) timezones.push(tz);
    if (mode === 'event' && ev) {
      ev.raw[key] = value;
      if (key === 'UID') ev.uid = value;
      if (key === 'DTSTART') {
        ev.dtstart = value;
        ev.tzid = ev.tzid ?? tz;
      }
      if (key === 'DTEND') ev.dtend = value;
      if (key === 'SUMMARY') ev.summary = value;
      if (key === 'DESCRIPTION') ev.description = value;
      if (key === 'LOCATION') ev.location = value;
    } else if (mode !== 'tz') {
      calendar[key] = value;
    }
  }
  return { calendar, events, timezones: [...new Set(timezones)] };
}

function eventKey(e: IcsEvent): string {
  return e.uid || `${e.dtstart ?? ''}|${e.summary ?? ''}|${e.location ?? ''}`;
}

export function mergeIcs(texts: string[]): {
  events: IcsEvent[];
  ics: string;
  csv: string;
  collisions: number;
  timezones: string[];
} {
  const all: IcsEvent[] = [];
  const timezones: string[] = [];
  for (const t of texts) {
    const parsed = parseIcs(t);
    all.push(...parsed.events);
    timezones.push(...parsed.timezones);
  }
  const map = new Map<string, IcsEvent>();
  let collisions = 0;
  for (const e of all) {
    const k = eventKey(e);
    if (map.has(k)) {
      collisions += 1;
      const prev = map.get(k)!;
      if (!prev.description && e.description) prev.description = e.description;
      if (!prev.location && e.location) prev.location = e.location;
      continue;
    }
    map.set(k, { ...e, raw: { ...e.raw } });
  }
  const events = [...map.values()];
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NeoTools//ICS Merge//DE',
    'CALSCALE:GREGORIAN',
    ...events.flatMap((e) => {
      const lines = ['BEGIN:VEVENT', `UID:${e.uid}`];
      if (e.dtstart) lines.push(`DTSTART${e.tzid ? `;TZID=${e.tzid}` : ''}:${e.dtstart}`);
      if (e.dtend) lines.push(`DTEND${e.tzid ? `;TZID=${e.tzid}` : ''}:${e.dtend}`);
      if (e.summary) lines.push(`SUMMARY:${e.summary}`);
      if (e.description) lines.push(`DESCRIPTION:${e.description}`);
      if (e.location) lines.push(`LOCATION:${e.location}`);
      lines.push('END:VEVENT');
      return lines;
    }),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  const csv = [
    'uid,dtstart,dtend,summary,location,tzid',
    ...events.map((e) => [e.uid, e.dtstart ?? '', e.dtend ?? '', e.summary ?? '', e.location ?? '', e.tzid ?? ''].map(csvEsc).join(',')),
  ].join('\n');
  return { events, ics, csv: `${csv}\n`, collisions, timezones: [...new Set(timezones)] };
}

function csvEsc(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
