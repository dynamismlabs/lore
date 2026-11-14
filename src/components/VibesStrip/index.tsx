/**
 * Vibes on Home: the last seven days as small circles, today at the end.
 * Tap today → the camera opens, ready to record a few seconds. Tap a filled day
 * → the week plays back to back (including shared family vibes).
 */
import { useMemo, useState } from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { VIBES_URL } from '@/constants/pages';
import { currentStreak, dayKey } from '@/lib/client/days';
import { trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import SecondCapture from '@/components/Capture/SecondCapture';
import SecondsPlayer, { type SecondClip } from '@/components/SecondsPlayer';

interface Props {
  collectionId?: string;
  className?: string;
}

export default function VibesStrip({ collectionId, className }: Props) {
  const [range] = useState(() => {
    const today = startOfDay(new Date());
    return { today, from: addDays(today, -400), to: addDays(today, 1) };
  });
  const { data: clips } = trpc.stories.seconds.useQuery({
    from: range.from,
    to: range.to,
  });
  const [capture, setCapture] = useState<{ day: Date } | null>(null);
  const [player, setPlayer] = useState<{ clips: SecondClip[]; start: number } | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(range.today, i - 6)),
    [range.today],
  );
  const byDay = useMemo(() => {
    const map = new Map<string, SecondClip>();
    for (const clip of clips ?? []) {
      const key = dayKey(clip.occurredAt);
      // Prefer showing your own clip if both you and someone else recorded today,
      // otherwise show the shared clip so family vibes appear right on Home.
      if (!map.has(key) || clip.isMine) map.set(key, clip);
    }
    return map;
  }, [clips]);
  const weekClips = useMemo(() => {
    const weekKeys = new Set(days.map((d) => dayKey(d)));
    return (clips ?? []).filter((c) => weekKeys.has(dayKey(c.occurredAt)));
  }, [clips, days]);
  const streak = currentStreak(new Set(byDay.keys()));
  const todayDone = byDay.has(dayKey(range.today));

  return (
    <section className={cn('select-none', className)} aria-label="Vibes">
      <div className="mb-3 flex items-baseline justify-between">
        <Link href={VIBES_URL} className="text-sm font-medium hover:underline">
          Vibes <span className="font-normal text-muted-foreground">· a few seconds a day</span>
        </Link>
        <span className="text-sm text-muted-foreground">
          {streak > 0 ? `${streak}-day streak` : todayDone ? '' : 'Start today'}
        </span>
      </div>
      <ol className="flex items-start justify-between gap-2.5 sm:gap-3">
        {days.map((day) => {
          const clip = byDay.get(dayKey(day));
          const isToday = dayKey(day) === dayKey(range.today);
          return (
            <li key={day.toISOString()} className="flex flex-1 flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (clip) {
                    const idx = weekClips.findIndex((c) => c.id === clip.id);
                    setPlayer({ clips: weekClips, start: Math.max(0, idx) });
                  } else {
                    setCapture({ day });
                  }
                }}
                aria-label={
                  clip
                    ? `Play ${format(day, 'EEEE')}’s vibe`
                    : isToday
                      ? 'Record today’s vibe'
                      : `Add a vibe for ${format(day, 'EEEE')}`
                }
                className={cn(
                  'relative flex aspect-square w-full max-w-10 items-center justify-center overflow-hidden rounded-full transition-transform active:scale-95 sm:max-w-12',
                  clip
                    ? 'ring-[1.5px] ring-foreground ring-offset-[2.5px] ring-offset-background'
                    : isToday
                      ? 'border-2 border-dashed border-foreground/70 text-foreground'
                      : 'bg-muted text-muted-foreground/40',
                )}
              >
                {clip ? (
                  <video
                    src={`${clip.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="pointer-events-none size-full object-cover"
                  />
                ) : isToday ? (
                  <Plus className="size-5" />
                ) : null}
              </button>
              <span
                className={cn(
                  'text-[11px]',
                  isToday ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {isToday ? 'Today' : format(day, 'EEEEE')}
              </span>
            </li>
          );
        })}
      </ol>

      {capture && (
        <SecondCapture
          day={capture.day}
          collectionId={collectionId}
          onClose={() => setCapture(null)}
        />
      )}
      {player && (
        <SecondsPlayer
          clips={player.clips}
          title="This week"
          startIndex={player.start}
          onClose={() => setPlayer(null)}
        />
      )}
    </section>
  );
}
