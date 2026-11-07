import { DEFAULT_TIMEZONE, type IsoDate } from '@mm/types';

/**
 * Calendar-date utilities on `YYYY-MM-DD` strings.
 *
 * All arithmetic is done on whole UTC day numbers, so results never depend on the host
 * machine's timezone or DST. "Today" is always resolved explicitly in the user's timezone.
 */

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class DateError extends Error {
  override name = 'DateError';
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const m = ISO_DATE_RE.exec(date);
  if (!m) throw new DateError(`Invalid ISO date "${date}"`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new DateError(`Invalid ISO date "${date}"`);
  }
  return { year, month, day };
}

export function isValidIsoDate(date: string): boolean {
  try {
    parseIsoDate(date);
    return true;
  } catch {
    return false;
  }
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Days since 1970-01-01. */
export function toDayNumber(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function fromDayNumber(dayNumber: number): IsoDate {
  const d = new Date(dayNumber * DAY_MS);
  return makeDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return makeDate(year, month, 1);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return makeDate(year, month, daysInMonth(year, month));
}

/** `YYYY-MM` */
export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

/**
 * The date `months` after `date`'s month, on `anchorDay` (defaults to `date`'s day), clamped to
 * the last day of the target month. Feb 29 + 12 months → Feb 28 in a non-leap year.
 */
export function addMonthsClamped(date: IsoDate, months: number, anchorDay?: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  const target = anchorDay ?? day;
  return makeDate(y, m, Math.min(target, daysInMonth(y, m)));
}

/** Inclusive list of dates from `from` to `to`. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const end = toDayNumber(to);
  for (let n = toDayNumber(from); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

/** The calendar date "now" in an IANA timezone (default Asia/Manila). */
export function todayInTimeZone(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): IsoDate {
  return dateInTimeZone(now, timeZone);
}

export function dateInTimeZone(instant: Date, timeZone: string = DEFAULT_TIMEZONE): IsoDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return makeDate(get('year'), get('month'), get('day'));
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "Dec 15, 2026" — display helper independent of the runtime's locale data. */
export function formatDate(date: IsoDate, withYear = true): string {
  const { year, month, day } = parseIsoDate(date);
  return `${MONTH_NAMES[month - 1]} ${day}${withYear ? `, ${year}` : ''}`;
}

/** "Dec 2026" from "2026-12". */
export function formatMonth(key: string): string {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}
