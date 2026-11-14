/**
 * A collection as an editorial page: a centred intro (name, faces, Play), then
 * its memories laid out like a book, newest first. A floating pill adds to it,
 * invites people or plays it as a story (desktop; phones use the tab bar's +).
 */
import { useState } from 'react';
import { ChevronLeft, MoreHorizontal, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { COLLECTIONS_URL } from '@/constants/pages';
import { isConnectionError } from '@/lib/client/errors';
import { roleAtLeastClient } from '@/lib/client/roles';
import { trpc } from '@/lib/client/trpc';
import { useViewer } from '@/hooks/useViewer';
import { CollectionFormDialog } from '@/screens/Collections';
import AppShell from '@/components/AppShell';
import CaptureBar from '@/components/CaptureBar';
import OfflineNotice from '@/components/OfflineNotice';
import StoryPlayer from '@/components/StoryPlayer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import ActionPill from './ActionPill';
import Intro, { memberNames } from './Intro';
import Moments from './Moments';
import ShareDialog from './ShareDialog';

interface Props {
  id: string;
}

export default function CollectionScreen({ id }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { viewer } = useViewer();
  const { data: collection, error } = trpc.collections.byId.useQuery({ id });
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [playing, setPlaying] = useState(false);

  const remove = trpc.collections.delete.useMutation({
    onSuccess: ({ movedToMoments }) => {
      utils.invalidate();
      toast(
        movedToMoments
          ? `Deleted. ${movedToMoments} ${movedToMoments === 1 ? 'memory was' : 'memories were'} moved back to Personal.`
          : 'Collection deleted',
      );
      router.replace(COLLECTIONS_URL);
    },
    onError: (e) => toast.error(e.message),
  });
  const leave = trpc.collections.leave.useMutation({
    onSuccess: () => {
      utils.invalidate();
      router.replace(COLLECTIONS_URL);
    },
    onError: (e) => toast.error(e.message),
  });

  if (error && isConnectionError(error)) {
    return (
      <AppShell captureCollectionId={id}>
        <main className="mx-auto max-w-2xl px-4">
          <OfflineNotice />
        </main>
      </AppShell>
    );
  }
  if (error) {
    return (
      <AppShell>
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="font-serif text-2xl">This collection isn’t available</p>
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted, or you’re no longer in it.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href={COLLECTIONS_URL}>Back to collections</Link>
          </Button>
        </main>
      </AppShell>
    );
  }

  const isOwner = collection?.role === 'owner';
  const canAdd = roleAtLeastClient(collection?.role, 'contributor');

  return (
    <AppShell captureCollectionId={canAdd ? id : undefined}>
      <main className="mx-auto w-full max-w-2xl px-5 pb-28 sm:px-6 md:pb-36">
        <div className="flex h-12 items-center justify-between pt-[env(safe-area-inset-top)] md:mt-4">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href={COLLECTIONS_URL}>
              <ChevronLeft /> Collections
            </Link>
          </Button>
          {collection && !collection.isDefault && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Collection options"
                  className="-mr-2"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner ? (
                  <>
                    <DropdownMenuItem onSelect={() => setEditing(true)}>Rename</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => {
                        if (
                          window.confirm(
                            `Delete “${collection.name}”? Memories that only live here go back to whoever added them.`,
                          )
                        ) {
                          remove.mutate({ id });
                        }
                      }}
                    >
                      Delete collection
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => {
                      if (
                        window.confirm(
                          `Leave “${collection.name}”? You’ll keep the memories you added.`,
                        )
                      ) {
                        leave.mutate({ id });
                      }
                    }}
                  >
                    Leave collection
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!collection ? (
          <div className="flex flex-col items-center pt-16">
            <Skeleton className="mb-9 h-[3px] w-12" />
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="mt-5 h-5 w-1/2" />
          </div>
        ) : (
          <>
            <Intro
              collection={collection}
              viewerId={viewer?.id}
              onPeople={() => setSharing(true)}
              onPlay={() => setPlaying(true)}
            />

            <Moments
              collectionId={id}
              onPlay={() => setPlaying(true)}
              empty={
                <div className="flex flex-col items-center gap-6 text-center">
                  <div>
                    <p className="font-serif text-2xl">Nothing here yet</p>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                      {canAdd
                        ? isOwner && collection.members.length === 1 && !collection.isDefault
                          ? 'Add the first memory, then invite the people who should add theirs.'
                          : 'Add the first memory.'
                        : 'When someone adds a memory, it’ll show up here.'}
                    </p>
                  </div>
                  {canAdd && <CaptureBar collectionId={id} className="w-full max-w-md" />}
                  {isOwner && !collection.isDefault && collection.members.length === 1 && (
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setSharing(true)}
                    >
                      <UserPlus /> Invite someone
                    </Button>
                  )}
                </div>
              }
            />

            <ActionPill
              collectionId={id}
              canAdd={canAdd}
              showPeople={!collection.isDefault}
              isOwner={isOwner}
              canPlay={collection.storyCount > 0}
              onPeople={() => setSharing(true)}
              onPlay={() => setPlaying(true)}
            />

            <ShareDialog collection={collection} open={sharing} onOpenChange={setSharing} />
            {editing && (
              <CollectionFormDialog
                open={editing}
                onOpenChange={setEditing}
                existing={{ id, name: collection.name, description: collection.description }}
              />
            )}
            {playing && (
              <StoryPlayer
                title={collection.name}
                subtitle={collection.isDefault ? undefined : memberNames(collection.members)}
                filters={{ collectionId: id }}
                onClose={() => setPlaying(false)}
              />
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
