import { describe, expect, it } from 'vitest';
import { anchorDate, approximateDate, formatApproximateDate, parseApproximateDate } from './dates';

describe('approximate dates', () => {
  it('parses a year, a month or a day', () => {
    expect(parseApproximateDate('2019')).toEqual({
      date: new Date('2019-01-01T12:00:00Z'),
      precision: 'year',
    });
    expect(parseApproximateDate('2019-06')).toEqual({
      date: new Date('2019-06-01T12:00:00Z'),
      precision: 'month',
    });
    expect(parseApproximateDate('2019-06-03')).toEqual({
      date: new Date('2019-06-03T12:00:00Z'),
      precision: 'day',
    });
  });

  it('rejects anything else', () => {
    for (const value of ['', '19', '2019-13', '2019-02-30', 'June 2019', '2019-06-03T10:00']) {
      expect(parseApproximateDate(value)).toBeNull();
    }
  });

  it('snaps to the start of the period and round-trips', () => {
    const date = new Date('2019-08-20T23:30:00Z');
    expect(anchorDate(date, 'day')).toBe(date);
    expect(anchorDate(date, 'month')).toEqual(approximateDate(2019, 7));
    expect(anchorDate(anchorDate(date, 'year'), 'year')).toEqual(approximateDate(2019));
    expect(formatApproximateDate(anchorDate(date, 'month'), 'month')).toBe('2019-08');
    expect(formatApproximateDate(date, 'year')).toBe('2019');
  });
});
