/**
 * A collection's memories, newest first, with a quiet marker for each month
 * and, at the bottom, where it all began.
 */
import { Fragment, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Loader2, Play } from 'lucide-react';
import { approximateLabel, periodOf } from '@/lib/client/dates';
import { isConnectionError } from '@/lib/client/errors';
import { type Memory, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import OfflineNotice from '@/components/OfflineNotice';
import { Skeleton } from '@/components/ui/skeleton';
import Moment from './Moment';

interface Props {
  collectionId: string;
  empty: React.ReactNode;
  onPlay: () => void;
}

const periodLabel = (memory: Memory) => periodOf(memory.occurredAt, memory.occurredPrecision).label;

export default function Moments({ collectionId, empty, onPlay }: Props) {
  const query = trpc.stories.list.useInfiniteQuery(
    { collectionId, sort: 'occurred' },
    {
      getNextPageParam: (last) => last.nextCursor,
      initialCursor: 0,
      // Keep polling while a transcript is being written.
      refetchInterval: (q) =>
        q.state.data?.pages.some((p) =>
          p.items.some((m) => m.media.some((x) => x.transcriptStatus === 'pending')),
        )
          ? 2000
          : false,
    },
  );
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && query.hasNextPage && !query.isFetchingNextPage)
          query.fetchNextPage();
      },
      { rootMargin: '800px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [query]);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }
  if (query.isError) {
    return isConnectionError(query.error) ? (
      <OfflineNotice />
    ) : (
      <p className="py-10 text-center text-sm text-muted-foreground">{query.error.message}</p>
    );
  }

  const memories = query.data.pages.flatMap((p) => p.items);
  if (!memories.length) return <>{empty}</>;
  const first = memories[memories.length - 1];

  return (
    <div>
      {memories.map((memory, i) => {
        const newMonth = i === 0 || periodLabel(memory) !== periodLabel(memories[i - 1]);
        return (
          <Fragment key={memory.id}>
            {newMonth && (
              <MonthMarker label={periodLabel(memory)} className={cn(i > 0 && 'mt-24 sm:mt-28')} />
            )}
            <div className={newMonth ? 'mt-10 sm:mt-12' : 'mt-20 sm:mt-24'}>
              <Moment memory={memory} />
            </div>
          </Fragment>
        );
      })}

      <div ref={sentinel} />
      {query.isFetchingNextPage && (
        <Loader2
          className="mx-auto mt-16 size-5 animate-spin text-muted-foreground"
          aria-label="Loading more"
        />
      )}

      {!query.hasNextPage && memories.length > 1 && (
        <footer className="mt-28 flex flex-col items-center gap-3 text-center">
          <div className="mb-4 h-[3px] w-12 rounded-full bg-foreground" aria-hidden />
          <p className="font-serif text-3xl font-medium tracking-tight">Where it began</p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {approximateLabel(first.occurredAt, first.occurredPrecision) ??
              format(first.occurredAt, 'MMMM d, yyyy')}
          </p>
          <button
            type="button"
            onClick={onPlay}
            className="mt-5 inline-flex h-11 items-center gap-2.5 rounded-full border px-5 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="size-3.5 fill-current" /> Play from the beginning
          </button>
        </footer>
      )}
    </div>
  );
}

function MonthMarker({ label, className }: { label: string; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground',
        className,
      )}
    >
      <span className="h-px flex-1 bg-border" />
      <h3>{label}</h3>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
