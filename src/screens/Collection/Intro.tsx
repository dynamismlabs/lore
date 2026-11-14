/**
 * The top of a collection page, like the first page of a book: a short rule,
 * the name in large serif, what it's for, the faces of who's in it, and Play.
 */
import { useState } from 'react';
import { Lock, Play, Plus, UserPlus } from 'lucide-react';
import type { RouterOutputs } from '@/lib/client/trpc';
import QuickInviteDialog from '@/components/QuickInviteDialog';
import UserAvatar from '@/components/UserAvatar';

type Collection = RouterOutputs['collections']['byId'];

interface Props {
  collection: Collection;
  viewerId?: string;
  onPeople: () => void;
  onPlay: () => void;
}

/** "You, Sam and June" (or first names only, for the TV). */
export function memberNames(members: Collection['members'], viewerId?: string) {
  const names = members.map((m) => (m.id === viewerId ? 'You' : m.name.split(' ')[0] || m.name));
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} others`;
}

export default function Intro({ collection, viewerId, onPeople, onPlay }: Props) {
  const isOwner = collection.role === 'owner';
  const count = collection.storyCount;
  const [quickInviting, setQuickInviting] = useState(false);

  return (
    <header className="mx-auto max-w-2xl pb-16 pt-6 text-center sm:pb-20 md:pt-12">
      <div className="mx-auto mb-9 h-[3px] w-12 rounded-full bg-foreground" aria-hidden />
      <h1 className="text-balance font-serif text-[2.75rem] font-medium leading-[1.05] tracking-tight sm:text-6xl">
        {collection.name}
      </h1>
      {collection.description && (
        <p className="mx-auto mt-5 max-w-lg text-balance font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
          {collection.description}
        </p>
      )}

      {collection.isDefault ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="mx-auto flex max-w-sm items-start justify-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            Only you can see this. Move memories into a shared collection to share them.
          </p>
          <button
            type="button"
            onClick={() => setQuickInviting(true)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <UserPlus className="size-3.5" /> Start a shared collection & invite someone
          </button>
          <QuickInviteDialog open={quickInviting} onOpenChange={setQuickInviting} />
        </div>
      ) : (
        <button
          type="button"
          onClick={onPeople}
          className="group mx-auto mt-8 flex flex-col items-center gap-3 rounded-2xl px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={isOwner ? 'Invite people to this collection' : 'Who’s in this collection'}
        >
          <span className="flex -space-x-2.5">
            {collection.members.slice(0, 6).map((m) => (
              <UserAvatar
                key={m.id}
                name={m.name}
                image={m.image}
                className="size-10 text-sm ring-[3px] ring-background"
              />
            ))}
            {isOwner && (
              <span className="relative flex size-10 items-center justify-center rounded-full border border-dashed border-foreground/35 bg-background text-muted-foreground ring-[3px] ring-background transition-colors group-hover:border-foreground group-hover:text-foreground">
                <Plus className="size-4" />
              </span>
            )}
          </span>
          <span className="text-sm text-muted-foreground transition-colors group-hover:text-foreground">
            {memberNames(collection.members, viewerId)}
            {isOwner && <span className="font-medium text-foreground"> · Invite</span>}
          </span>
        </button>
      )}

      {count > 0 && (
        <div className="mt-9 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onPlay}
            className="inline-flex h-11 items-center gap-2.5 rounded-full border px-5 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Play className="size-3.5 fill-current" /> Play the story
          </button>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {count} {count === 1 ? 'memory' : 'memories'}
          </span>
        </div>
      )}
    </header>
  );
}
