/**
 * Choose which collection a new memory goes into.
 * Shared by default: once you have a shared collection (e.g. "Our family"),
 * new captures default to it automatically, while keeping private "Moments"
 * one tap away in the menu.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Lock, Users } from 'lucide-react';
import {
  readCachedCollections,
  resolveDefaultCollectionId,
  writeCachedCollections,
  writePreferredCollectionId,
} from '@/lib/client/device';
import { type RouterOutputs, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import { useViewer } from '@/hooks/useViewer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  value: string | undefined;
  onChange: (collectionId: string) => void;
  className?: string;
}

type Writable = RouterOutputs['stories']['writableCollections'];

export default function CollectionSelect({ value, onChange, className }: Props) {
  const { viewer } = useViewer();
  // Offline, the last list this device saw (so you can still pick, and the label is right).
  const [offlineList] = useState(() => readCachedCollections<Writable>(viewer?.id));
  const query = trpc.stories.writableCollections.useQuery(undefined, {
    placeholderData: offlineList,
  });

  // Ensure shared collections always appear above private Moments.
  const collections = useMemo(() => {
    if (!query.data) return undefined;
    return [...query.data].sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
      return 0;
    });
  }, [query.data]);

  useEffect(() => {
    if (viewer?.id && collections && !query.isPlaceholderData) {
      writeCachedCollections(viewer.id, collections);
    }
  }, [viewer?.id, collections, query.isPlaceholderData]);

  // Default to the user's preferred/first shared collection once collections load
  // (falling back to Moments only when they don't have a shared collection yet).
  useEffect(() => {
    if (!value && collections?.length) {
      const nextId = resolveDefaultCollectionId(viewer?.id, collections);
      if (nextId) onChange(nextId);
    }
  }, [collections, value, viewer?.id, onChange]);

  const handleSelect = (nextId: string) => {
    onChange(nextId);
    const picked = collections?.find((c) => c.id === nextId);
    if (viewer?.id && picked && !picked.isDefault) {
      writePreferredCollectionId(viewer.id, nextId);
    }
  };

  const current = collections?.find((c) => c.id === value) ?? collections?.[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          className,
        )}
        aria-label="Choose collection"
      >
        {current?.isDefault ? <Lock className="size-3.5" /> : <Users className="size-3.5" />}
        <span className="truncate">{current?.name ?? 'Our family'}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Save to
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={value ?? current?.id} onValueChange={handleSelect}>
          {collections?.map((c) => (
            <DropdownMenuRadioItem key={c.id} value={c.id}>
              <span className="truncate">{c.name}</span>
              <span className="ml-auto pl-2 text-xs text-muted-foreground">
                {c.isDefault ? 'Only you' : 'Shared'}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
