/**
 * Vibes — a few seconds a day: a calendar of short clips, a streak, and a
 * player that turns a month or a year into a minute of life. Switch to a
 * shared collection to see everyone's vibes together.
 */
import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isAfter,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Play, Plus } from 'lucide-react';
import { currentStreak, dayKey } from '@/lib/client/days';
import { type RouterOutputs, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import AppShell from '@/components/AppShell';
import SecondCapture from '@/components/Capture/SecondCapture';
import PageHeader from '@/components/PageHeader';
import SecondsPlayer, { type SecondClip } from '@/components/SecondsPlayer';
import { Button } from '@/components/ui/button';

type Clip = RouterOutputs['stories']['seconds'][number];

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function SecondsScreen() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [scope, setScope] = useState<string>('all'); // 'all', 'mine', or a collection id
  const [capture, setCapture] = useState<{ day: Date } | null>(null);
  const [player, setPlayer] = useState<{
    clips: SecondClip[];
    title: string;
    start: number;
  } | null>(null);

  const utils = trpc.useUtils();
  const { data: collections } = trpc.collections.list.useQuery();
  const shared = collections?.filter((c) => !c.isDefault) ?? [];
  const filter =
    scope === 'all' ? {} : scope === 'mine' ? { onlyMine: true } : { collectionIds: [scope] };

  const today = startOfDay(new Date());
  const monthQuery = trpc.stories.seconds.useQuery({
    from: startOfWeek(month),
    to: addDays(endOfMonth(month), 7),
    ...filter,
  });
  // Your own seconds for the streak (last ~13 months).
  const mine = trpc.stories.seconds.useQuery({
    from: addDays(today, -400),
    to: addDays(today, 1),
    onlyMine: true,
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Clip[]>();
    for (const clip of monthQuery.data ?? []) {
      const key = dayKey(clip.occurredAt);
      map.set(key, [...(map.get(key) ?? []), clip]);
    }
    return map;
  }, [monthQuery.data]);

  const myDays = useMemo(
    () => new Set((mine.data ?? []).map((c) => dayKey(c.occurredAt))),
    [mine.data],
  );
  const streak = currentStreak(myDays);
  const thisYear = (mine.data ?? []).filter(
    (c) => !isAfter(startOfYear(today), c.occurredAt),
  ).length;
  const myToday = (mine.data ?? []).filter((c) => dayKey(c.occurredAt) === dayKey(today));

  const monthClips = (monthQuery.data ?? []).filter((c) => isSameMonth(c.occurredAt, month));
  const weeks = useMemo(() => {
    const first = startOfWeek(month);
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)),
    ).filter((week) => week.some((d) => isSameMonth(d, month)));
  }, [month]);

  const playYear = async () => {
    const clips = await utils.stories.seconds.fetch({
      from: startOfYear(today),
      to: addDays(today, 1),
      ...filter,
    });
    if (clips.length) setPlayer({ clips, title: `${format(today, 'yyyy')} in vibes`, start: 0 });
  };

  const openCapture = (day: Date) => {
    setCapture({ day });
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 pb-12 sm:px-6 md:pt-6">
        <PageHeader
          title="Vibes"
          subtitle={
            streak > 0
              ? `${streak}-day streak · ${thisYear} ${thisYear === 1 ? 'day' : 'days'} this year`
              : 'A few seconds of video, every day. Watch your year back in minutes.'
          }
        />

        <Button
          className="mt-6 h-14 w-full rounded-xl text-base"
          onClick={() => openCapture(today)}
        >
          <Plus /> {myToday.length ? 'Replace today’s vibe' : 'Add today’s vibe'}
        </Button>

        {shared.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Whose vibes">
            {[{ id: 'all', name: 'Everyone' }, ...shared, { id: 'mine', name: 'Just me' }].map(
              (c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setScope(c.id)}
                  aria-pressed={scope === c.id}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    scope === c.id
                      ? 'border-foreground bg-foreground text-background'
                      : 'hover:bg-accent',
                  )}
                >
                  {c.name}
                </button>
              ),
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft />
            </Button>
            <h2 className="min-w-36 text-center font-serif text-xl">
              {format(month, 'MMMM yyyy')}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              disabled={isSameMonth(month, today)}
              onClick={() => setMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={!monthClips.length}
            onClick={() =>
              setPlayer({ clips: monthClips, title: format(month, 'MMMM yyyy'), start: 0 })
            }
          >
            <Play className="fill-current" /> Play month
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
          {WEEKDAYS.map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1.5">
          {weeks.flat().map((day) => {
            const clips = byDay.get(dayKey(day)) ?? [];
            const inMonth = isSameMonth(day, month);
            const future = isAfter(day, today);
            const first = clips[0];
            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={future || (!clips.length && scope !== 'mine')}
                onClick={() =>
                  first
                    ? setPlayer({
                        clips: monthClips,
                        title: format(month, 'MMMM yyyy'),
                        start: Math.max(0, monthClips.indexOf(first)),
                      })
                    : openCapture(day)
                }
                aria-label={`${format(day, 'MMMM d')}${clips.length ? `, ${clips.length} ${clips.length === 1 ? 'vibe' : 'vibes'}` : ''}`}
                className={cn(
                  'relative aspect-[3/4] overflow-hidden rounded-lg text-left',
                  inMonth ? 'bg-muted' : 'bg-muted/30',
                  !inMonth && 'opacity-40',
                  dayKey(day) === dayKey(today) && 'ring-2 ring-foreground',
                  future && 'opacity-30',
                )}
              >
                {first && (
                  <video
                    src={`${first.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 size-full object-cover"
                  />
                )}
                <span
                  className={cn(
                    'absolute left-1 top-1 text-[11px] font-medium',
                    first ? 'text-white drop-shadow' : 'text-muted-foreground',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {clips.length > 1 && (
                  <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white">
                    {clips.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Button variant="ghost" onClick={playYear}>
            <Play className="fill-current" /> Play {format(today, 'yyyy')} so far
          </Button>
        </div>
      </main>

      {capture && (
        <SecondCapture
          day={capture.day}
          collectionId={scope === 'mine' ? undefined : scope}
          onClose={() => setCapture(null)}
        />
      )}
      {player && (
        <SecondsPlayer
          clips={player.clips}
          title={player.title}
          startIndex={player.start}
          onClose={() => setPlayer(null)}
        />
      )}
    </AppShell>
  );
}
