/** Who's in this memory. Type a name to tag someone, or create them. */
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import Link from 'next/link';
import { personUrl } from '@/constants/pages';
import { type Memory, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  memory: Memory;
  className?: string;
}

export default function PeopleTags({ memory, className }: Props) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: people } = trpc.people.list.useQuery(undefined, { enabled: open });
  const refresh = () => {
    utils.stories.invalidate();
    utils.people.invalidate();
  };
  const tag = trpc.people.tag.useMutation({ onSuccess: refresh });
  const untag = trpc.people.untag.useMutation({ onSuccess: refresh });
  const create = trpc.people.create.useMutation();

  const taggedIds = new Set(memory.people.map((p) => p.id));
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter(
      (p) => !taggedIds.has(p.id) && (!q || p.name.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, query, memory.people]);
  const exact = (people ?? []).some((p) => p.name.toLowerCase() === query.trim().toLowerCase());

  if (!memory.people.length && !memory.canContribute) return null;

  const tagNew = async () => {
    const name = query.trim();
    if (!name) return;
    const person = await create.mutateAsync({ name });
    await tag.mutateAsync({ storyId: memory.id, personId: person.id });
    setQuery('');
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {memory.people.map((person) => (
        <span
          key={person.id}
          className="inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm"
        >
          <Link href={personUrl(person.id)} className="hover:underline">
            {person.name}
          </Link>
          {memory.canContribute ? (
            <button
              type="button"
              aria-label={`Untag ${person.name}`}
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => untag.mutate({ storyId: memory.id, personId: person.id })}
            >
              <X className="size-3" />
            </button>
          ) : (
            <span className="w-2" />
          )}
        </span>
      ))}
      {memory.canContribute && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" /> {memory.people.length ? 'Tag' : 'Who’s in this?'}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (matches[0] && matches[0].name.toLowerCase() === query.trim().toLowerCase()) {
                    tag.mutate({ storyId: memory.id, personId: matches[0].id });
                    setQuery('');
                  } else tagNew();
                }
              }}
            />
            <div className="mt-1 flex max-h-56 flex-col overflow-y-auto">
              {matches.slice(0, 20).map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    tag.mutate({ storyId: memory.id, personId: person.id });
                    setQuery('');
                  }}
                >
                  {person.name}
                  {person.relationship && (
                    <span className="text-muted-foreground"> · {person.relationship}</span>
                  )}
                </button>
              ))}
              {query.trim() && !exact && (
                <button
                  type="button"
                  className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={tagNew}
                >
                  <Plus className="mr-1 inline size-3.5" /> Add “{query.trim()}”
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
