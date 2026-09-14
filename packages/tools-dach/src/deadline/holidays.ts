/** Nationwide German holidays + optional state extras. Easter via Anonymous Gregorian algorithm. */

export type Bundesland =
  | 'DE'
  | 'BW'
  | 'BY'
  | 'BE'
  | 'BB'
  | 'HB'
  | 'HH'
  | 'HE'
  | 'MV'
  | 'NI'
  | 'NW'
  | 'RP'
  | 'SL'
  | 'SN'
  | 'ST'
  | 'SH'
  | 'TH';

function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function holidaysFor(year: number, land: Bundesland = 'DE'): Set<string> {
  const e = easter(year);
  const set = new Set<string>([
    `${year}-01-01`,
    iso(addDays(e, -2)),
    iso(addDays(e, 1)),
    `${year}-05-01`,
    iso(addDays(e, 39)),
    iso(addDays(e, 50)),
    `${year}-10-03`,
    `${year}-12-25`,
    `${year}-12-26`,
  ]);
  const extra: Partial<Record<Bundesland, string[]>> = {
    BW: [`${year}-01-06`, iso(addDays(e, 60)), `${year}-11-01`],
    BY: [`${year}-01-06`, iso(addDays(e, 60)), `${year}-08-15`, `${year}-11-01`],
    BE: [`${year}-03-08`],
    BB: [`${year}-10-31`],
    HB: [`${year}-10-31`],
    HH: [`${year}-10-31`],
    HE: [iso(addDays(e, 60))],
    MV: [`${year}-03-08`, `${year}-10-31`],
    NI: [`${year}-10-31`],
    NW: [iso(addDays(e, 60)), `${year}-11-01`],
    RP: [iso(addDays(e, 60)), `${year}-11-01`],
    SL: [iso(addDays(e, 60)), `${year}-08-15`, `${year}-11-01`],
    SN: [`${year}-10-31`],
    ST: [`${year}-01-06`, `${year}-10-31`],
    SH: [`${year}-10-31`],
    TH: [`${year}-10-31`],
  };
  for (const day of extra[land] ?? []) set.add(day);
  return set;
}

export function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function isHoliday(d: Date, land: Bundesland): boolean {
  return holidaysFor(d.getUTCFullYear(), land).has(iso(d));
}

export function nextWorkday(d: Date, land: Bundesland): Date {
  let cur = new Date(d.getTime());
  while (isWeekend(cur) || isHoliday(cur, land)) cur = addDays(cur, 1);
  return cur;
}

export { addDays, iso };
