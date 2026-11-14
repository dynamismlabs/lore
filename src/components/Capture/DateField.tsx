/** A date shown as text that opens a calendar when tapped. Changing it keeps the time of day. */
import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  children: React.ReactNode;
  className?: string;
}

/** Old family stories go back a long way. */
const EARLIEST = new Date(1900, 0, 1);

export default function DateField({ value, onChange, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const [today] = useState(() => new Date());

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            onChange(next);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
