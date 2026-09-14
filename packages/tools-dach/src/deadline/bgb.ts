import { addDays, iso, nextWorkday, type Bundesland } from './holidays.js';

export type PeriodUnit = 'days' | 'weeks' | 'months';

/**
 * §§ 187–193 BGB:
 * Event-triggered period: the day of the event does not count (§ 187 I).
 * Weeks/months end on the same weekday/date (§ 188).
 * If that day is Sat/Sun/holiday → next working day (§ 193).
 */
export function computeDeadline(
  eventIso: string,
  count: number,
  unit: PeriodUnit,
  land: Bundesland = 'DE',
): { start: string; end: string; endWorkday: string } {
  const event = parseIso(eventIso);
  const start = addDays(event, 1);
  let end: Date;
  if (unit === 'days') end = addDays(start, count - 1);
  else if (unit === 'weeks') end = addDays(start, count * 7);
  else end = addMonthsClamp(event, count);
  const work = nextWorkday(end, land);
  return { start: iso(start), end: iso(end), endWorkday: iso(work) };
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function addMonthsClamp(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target;
}
