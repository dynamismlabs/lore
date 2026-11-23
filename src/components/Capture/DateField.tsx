/**
 * A date shown as text that opens a calendar when tapped. Changing the day keeps
 * the time of day. Pass `precision` to also allow "just the month" or "just the
 * year" for memories nobody remembers to the day.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { approximateDate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DatePrecision } from '@/db/constants';

interface Props {
  value: Date;
  onChange: (date: Date, precision: DatePrecision) => void;
  /** How exactly the date is known. Leave out for a day-only picker. */
  precision?: DatePrecision;
  children: React.ReactNode;
  className?: string;
}

/** Old family stories go back a long way. */
const EARLIEST = new Date(1900, 0, 1);
const MONTHS = Array.from({ length: 12 }, (_, month) => format(new Date(2000, month, 1), 'MMMM'));

export default function DateField({ value, onChange, precision, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const [today] = useState(() => new Date());
  const [mode, setMode] = useState<DatePrecision>(precision ?? 'day');
  const [year, setYear] = useState(value.getFullYear());
  const [month, setMonth] = useState(value.getMonth());

  const openChange = (next: boolean) => {
    if (next) {
      setMode(precision ?? 'day');
      setYear(value.getFullYear());
      setMonth(value.getMonth());
    }
    setOpen(next);
  };
  const years = Array.from(
    { length: today.getFullYear() - EARLIEST.getFullYear() + 1 },
    (_, i) => today.getFullYear() - i,
  );
  const latestMonth = year === today.getFullYear() ? today.getMonth() : 11;

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        aria-label={`When did this happen? ${format(value, 'MMMM d, yyyy')}`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground',
          className,
        )}
      >
        <CalendarDays className="size-4" />
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto rounded-xl p-0">
        {precision && (
          <Tabs
            value={mode}
            onValueChange={(next) => setMode(next as DatePrecision)}
            className="px-3 pt-3"
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {mode === 'day' ? (
          <Calendar
            mode="single"
            required
            selected={value}
            defaultMonth={value}
            captionLayout="dropdown"
            startMonth={EARLIEST}
            endMonth={today}
            disabled={{ after: today }}
            onSelect={(day) => {
              const next = new Date(value);
              next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
              onChange(next, 'day');
              setOpen(false);
            }}
          />
        ) : (
          <div className="flex w-72 flex-col gap-3 p-3">
            <p className="text-sm text-muted-foreground">
              {mode === 'month'
                ? 'Remember the month but not the day?'
                : 'Only remember the year? That’s enough.'}
            </p>
            <div className="flex gap-2">
              {mode === 'month' && (
                <Select
                  value={String(Math.min(month, latestMonth))}
                  onValueChange={(next) => setMonth(Number(next))}
                >
                  <SelectTrigger aria-label="Month" className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.slice(0, latestMonth + 1).map((name, i) => (
                      <SelectItem key={name} value={String(i)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={String(year)} onValueChange={(next) => setYear(Number(next))}>
                <SelectTrigger aria-label="Year" className={mode === 'month' ? 'w-28' : 'flex-1'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="self-end"
              onClick={() => {
                onChange(
                  approximateDate(year, mode === 'month' ? Math.min(month, latestMonth) : null),
                  mode,
                );
                setOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
