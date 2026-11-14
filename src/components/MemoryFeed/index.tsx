/** Infinite list of memories for home, a collection, or a person. */
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { type RouterInputs, trpc } from '@/lib/client/trpc';
import { useOnline } from '@/hooks/useOnline';
import MemoryCard from '@/components/MemoryCard';
import { Skeleton } from '@/components/ui/skeleton';

type Filters = Omit<RouterInputs['stories']['list'], 'cursor'>;

interface Props {
  filters: Filters;
  empty: React.ReactNode;
  hideCollection?: boolean;
}

export default function MemoryFeed({ filters, empty, hideCollection }: Props) {
  const query = trpc.stories.list.useInfiniteQuery(filters, {
    getNextPageParam: (last) => last.nextCursor,
    initialCursor: 0,
    // Keep polling while a transcript is being written.
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) =>
        p.items.some((m) => m.media.some((x) => x.transcriptStatus === 'pending')),
      )
        ? 2000
        : false,
  });
  const sentinel = useRef<HTMLDivElement>(null);
  const online = useOnline();

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && query.hasNextPage && !query.isFetchingNextPage)
          query.fetchNextPage();
      },
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [query]);

  if (query.isPending) {
    return (
      <div className="flex flex-col divide-y">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 py-7 first:pt-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {online
          ? query.error.message
          : 'You’re offline. Memories show up here when you’re back — anything you record now is kept on this device.'}
      </p>
    );
  }

  const memories = query.data.pages.flatMap((p) => p.items);
  if (!memories.length) return <>{empty}</>;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col divide-y">
        {memories.map((memory) => (
          <MemoryCard key={memory.id} memory={memory} hideCollection={hideCollection} />
        ))}
      </div>
      <div ref={sentinel} />
      {query.isFetchingNextPage && (
        <Loader2
          className="mx-auto size-5 animate-spin text-muted-foreground"
          aria-label="Loading more"
        />
      )}
    </div>
  );
}
