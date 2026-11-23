import { differenceInCalendarDays, format, isSameYear } from 'date-fns';
import type { DatePrecision } from '@/db/constants';

/** "June 2019" or "2019" for a date known only that well; null for an exact day. */
export function approximateLabel(date: Date, precision: DatePrecision) {
  if (precision === 'year') return format(date, 'yyyy');
  if (precision === 'month') return format(date, 'MMMM yyyy');
  return null;
}

/** "Today", "Yesterday", "Tuesday", "June 3", "June 3, 2019" — or "June 2019", "2019". */
export function friendlyDate(date: Date, precision: DatePrecision = 'day', now = new Date()) {
  const approximate = approximateLabel(date, precision);
  if (approximate) return approximate;
  const days = differenceInCalendarDays(now, date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return format(date, 'EEEE');
  return isSameYear(date, now) ? format(date, 'MMMM d') : format(date, 'MMMM d, yyyy');
}

/** "Monday, June 3, 2019" — or "June 2019", "2019". */
export function longDate(date: Date, precision: DatePrecision = 'day') {
  return approximateLabel(date, precision) ?? format(date, 'EEEE, MMMM d, yyyy');
}

/** Timeline section a memory falls under: its month, or just its year. */
export function periodOf(date: Date, precision: DatePrecision) {
  return precision === 'year'
    ? { key: format(date, 'yyyy'), label: format(date, 'yyyy') }
    : { key: format(date, 'yyyy-MM'), label: format(date, 'MMMM yyyy') };
}
