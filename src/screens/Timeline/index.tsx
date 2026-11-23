/**
 * Timeline: every memory across your collections, in the order it happened.
 * Filter to any mix of collections; each month shows its vibes as a
 * playable strip; "On this day" brings back past years.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarYears, format, startOfMonth } from 'date-fns';
import { Camera, Loader2, Mic, PenLine, Play } from 'lucide-react';
import Link from 'next/link';
import { memoryUrl } from '@/constants/pages';
import { periodOf } from '@/lib/client/dates';
import { formatDuration } from '@/lib/client/media';
import { type Memory, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import AppShell from '@/components/AppShell';
import { memorySummary } from '@/components/MemoryCard';
import PageHeader from '@/components/PageHeader';
import SecondsPlayer, { type SecondClip } from '@/components/SecondsPlayer';
import { Skeleton } from '@/components/ui/skeleton';

export default function TimelineScreen() {
  const { data: collections } = trpc.collections.list.useQuery();
  const [selected, setSelected] = useState<string[]>([]);
  const [player, setPlayer] = useState<{ clips: SecondClip[]; title: string } | null>(null);
  const collectionIds = selected.length ? selected : undefined;

  const feed = trpc.stories.list.useInfiniteQuery(
    { sort: 'occurred', limit: 30, collectionIds },
    { getNextPageParam: (last) => last.nextCursor, initialCursor: 0 },
  );
  const memories = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data]);

  const [onThisDayInput] = useState(() => {
    const now = new Date();
    return { today: format(now, 'yyyy-MM-dd'), tzOffsetMinutes: now.getTimezoneOffset() };
  });
  const onThisDay = trpc.stories.onThisDay.useQuery(onThisDayInput);

  const oldest = memories.at(-1)?.occurredAt;
  const [secondsRange] = useState(() => ({ to: new Date(Date.now() + 86_400_000) }));
  const seconds = trpc.stories.seconds.useQuery(
    { from: startOfMonth(oldest ?? new Date()), to: secondsRange.to, collectionIds },
    { enabled: !!feed.data },
  );

  const months = useMemo(() => {
    const groups: { key: string; label: string; items: Memory[] }[] = [];
    for (const memory of memories) {
      // A memory known only to the year gets a section of its own ("2019").
      const { key, label } = periodOf(memory.occurredAt, memory.occurredPrecision);
      let group = groups.at(-1);
      if (!group || group.key !== key) {
        group = { key, label, items: [] };
        groups.push(group);
      }
      group.items.push(memory);
    }
    return groups;
  }, [memories]);

  const secondsByMonth = useMemo(() => {
    const map = new Map<string, SecondClip[]>();
    for (const clip of seconds.data ?? []) {
      const key = format(clip.occurredAt, 'yyyy-MM');
      map.set(key, [...(map.get(key) ?? []), clip]);
    }
    return map;
  }, [seconds.data]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && feed.hasNextPage && !feed.isFetchingNextPage)
          feed.fetchNextPage();
      },
      { rootMargin: '800px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feed]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 pb-12 sm:px-6 md:pt-8">
        <PageHeader
          title="Timeline"
          subtitle="Every memory, across your collections, in the order it happened."
        />

        {!!collections?.length && collections.length > 1 && (
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Collections to show">
            <Chip active={!selected.length} onClick={() => setSelected([])}>
              Everything
            </Chip>
            {collections.map((c) => (
              <Chip key={c.id} active={selected.includes(c.id)} onClick={() => toggle(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        )}

        {!!onThisDay.data?.length && !selected.length && (
          <section className="mt-8" aria-label="On this day">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">On this day</h2>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              {onThisDay.data.map((memory) => {
                const years = differenceInCalendarYears(new Date(), memory.occurredAt);
                const image = memory.media.find((m) => m.kind === 'image');
                return (
                  <Link
                    key={memory.id}
                    href={memoryUrl(memory.id)}
                    className="w-56 shrink-0 snap-start overflow-hidden rounded-2xl border bg-card hover:border-foreground/20"
                  >
                    {image ? (
                      <img
                        src={image.url!}
                        alt=""
                        className="aspect-[4/3] w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="p-3">
                      <div className="text-xs text-muted-foreground">
                        {years === 1 ? '1 year ago' : `${years} years ago`} ·{' '}
                        {format(memory.occurredAt, 'yyyy')}
                      </div>
                      <div className="mt-1 line-clamp-3 font-serif">
                        {memorySummary(memory) || 'A memory'}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-8">
          {feed.isPending ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : months.length === 0 ? (
            <p className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              Nothing here yet. Memories show up on the timeline by the date they happened.
            </p>
          ) : (
            months.map((month, index) => {
              const clips = secondsByMonth.get(month.key) ?? [];
              return (
                // A period can repeat when "2019" and "January 2019" memories share a date.
                <section key={`${month.key}-${index}`} className="mb-8">
                  <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
                    <h2 className="font-serif text-xl">{month.label}</h2>
                    {clips.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPlayer({ clips, title: month.label })}
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-accent"
                      >
                        <Play className="size-3 fill-current" /> {clips.length}{' '}
                        {clips.length === 1 ? 'second' : 'seconds'}
                      </button>
                    )}
                  </div>
                  <ol className="flex flex-col gap-2">
                    {month.items.map((memory) => (
                      <li key={memory.id}>
                        <TimelineEntry memory={memory} />
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })
          )}
          <div ref={sentinel} />
          {feed.isFetchingNextPage && (
            <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
          )}
        </div>
      </main>
      {player && (
        <SecondsPlayer clips={player.clips} title={player.title} onClose={() => setPlayer(null)} />
      )}
    </AppShell>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        active ? 'border-foreground bg-foreground text-background' : 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

function TimelineEntry({ memory }: { memory: Memory }) {
  const image = memory.media.find((m) => m.kind === 'image');
  const audio = memory.media.find((m) => m.kind === 'audio');
  // A moment plays its stretch of a conversation.
  const clip = memory.clips[0];
  const listenMs = audio ? audio.durationMs : clip ? clip.endMs - clip.startMs : null;
  const text = memory.media.some((m) => m.kind === 'text');
  const photos = memory.media.filter((m) => m.kind === 'image' || m.kind === 'video').length;
  return (
    <Link
      href={memoryUrl(memory.id)}
      className="flex items-center gap-4 rounded-xl border bg-card p-3 transition-colors hover:border-foreground/20"
    >
      <div className="w-10 shrink-0 text-center">
        {memory.occurredPrecision === 'day' ? (
          <>
            <div className="font-serif text-2xl leading-none">{format(memory.occurredAt, 'd')}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {format(memory.occurredAt, 'EEE')}
            </div>
          </>
        ) : (
          <>
            <div className="font-serif text-lg leading-none">
              {format(memory.occurredAt, memory.occurredPrecision === 'month' ? 'MMM' : 'yyyy')}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
              {memory.occurredPrecision === 'month' ? 'month' : 'year'}
            </div>
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 font-serif text-[1.02rem] leading-snug">
          {memorySummary(memory) || 'Photos'}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {!memory.isMine && <span>{memory.author.name}</span>}
          {memory.collections[0] && (
            <span className="truncate">{memory.collections.map((c) => c.name).join(', ')}</span>
          )}
          {(audio || clip) && (
            <span className="inline-flex items-center gap-0.5">
              <Mic className="size-3" /> {formatDuration(listenMs)}
            </span>
          )}
          {text && !audio && !clip && <PenLine className="size-3" />}
          {photos > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Camera className="size-3" /> {photos}
            </span>
          )}
        </div>
      </div>
      {image && (
        <img
          src={image.url!}
          alt=""
          loading="lazy"
          className="size-14 shrink-0 rounded-lg object-cover"
        />
      )}
    </Link>
  );
}
