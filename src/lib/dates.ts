/**
 * Approximate dates, shared by the server and the app. A memory known only to
 * the month or year is stored at noon UTC on the first day of that period, so
 * it reads as the same month and year in every time zone and sorts at the
 * start of its period.
 */
import type { DatePrecision } from '@/db/constants';

/** The first day of a month or year, at noon UTC. `month` is 0-based. */
export function approximateDate(year: number, month: number | null = null) {
  return new Date(Date.UTC(year, month ?? 0, 1, 12));
}

/** Snap a date to its precision (idempotent for dates built with `approximateDate`). */
export function anchorDate(date: Date, precision: DatePrecision) {
  if (precision === 'day') return date;
  return approximateDate(date.getUTCFullYear(), precision === 'month' ? date.getUTCMonth() : null);
}

/**
 * "2019", "2019-06" or "2019-06-03" → a date and how exactly it's known.
 * A bare day means noon UTC that day, so it doesn't slide into the day before.
 */
export function parseApproximateDate(
  value: string,
): { date: Date; precision: DatePrecision } | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) - 1 : null;
  const day = match[3] ? Number(match[3]) : null;
  if (month !== null && (month < 0 || month > 11)) return null;
  if (day === null) {
    return { date: approximateDate(year, month), precision: month === null ? 'year' : 'month' };
  }
  const date = new Date(Date.UTC(year, month!, day, 12));
  if (date.getUTCMonth() !== month) return null;
  return { date, precision: 'day' };
}

/** The inverse of `parseApproximateDate`: "2019", "2019-06" or "2019-06-03" (UTC). */
export function formatApproximateDate(date: Date, precision: DatePrecision) {
  const iso = date.toISOString();
  return precision === 'year'
    ? iso.slice(0, 4)
    : precision === 'month'
      ? iso.slice(0, 7)
      : iso.slice(0, 10);
}
