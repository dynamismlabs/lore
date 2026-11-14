import { useEffect, useState } from 'react';
import { Loader2, Search as SearchIcon } from 'lucide-react';
import { useRouter } from 'next/router';
import { trpc } from '@/lib/client/trpc';
import AppShell from '@/components/AppShell';
import MemoryCard from '@/components/MemoryCard';
import PageHeader from '@/components/PageHeader';
import { Input } from '@/components/ui/input';

export default function SearchScreen() {
  const router = useRouter();
  const initial = typeof router.query.q === 'string' ? router.query.q : '';
  const [text, setText] = useState(initial);
  const [q, setQ] = useState(initial);

  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(text.trim());
      router.replace({ query: text.trim() ? { q: text.trim() } : {} }, undefined, {
        shallow: true,
      });
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const results = trpc.stories.search.useQuery({ q }, { enabled: q.length > 0 });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 sm:px-6 md:pt-8">
        <PageHeader title="Search" />
        <div className="relative mt-5">
          <SearchIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Words from a memory, a title, what someone said…"
            className="h-12 rounded-xl pl-10 text-base"
            autoFocus
            type="search"
          />
        </div>
        {results.isFetching && (
          <Loader2 className="mx-auto mt-6 size-5 animate-spin text-muted-foreground" />
        )}
        <div className="mt-6 flex flex-col divide-y">
          {results.data?.map((memory) => (
            <MemoryCard key={memory.id} memory={memory} />
          ))}
          {q && results.data?.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing matches “{q}”.
            </p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
