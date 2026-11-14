import { addDays, format, isSameDay, startOfDay } from 'date-fns';

/** Local calendar day, e.g. "2026-10-31". */
export function dayKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

/** Consecutive days (ending today, or yesterday if today isn't done yet) that have a clip. */
export function currentStreak(days: Set<string>, today = new Date()) {
  let cursor = startOfDay(today);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export { isSameDay };
