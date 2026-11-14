import { differenceInCalendarDays, format, isSameYear } from 'date-fns';

/** "Today", "Yesterday", "Tuesday", "June 3", "June 3, 2019". */
export function friendlyDate(date: Date, now = new Date()) {
  const days = differenceInCalendarDays(now, date);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return format(date, 'EEEE');
  return isSameYear(date, now) ? format(date, 'MMMM d') : format(date, 'MMMM d, yyyy');
}

export function longDate(date: Date) {
  return format(date, 'EEEE, MMMM d, yyyy');
}
