/** One memory, content first. Editing lives in a menu, out of the way. */
import { useState } from 'react';
import { ChevronLeft, Loader2, MoreHorizontal, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { HOME_URL, collectionUrl, memoryUrl } from '@/constants/pages';
import { longDate } from '@/lib/client/dates';
import { isConnectionError } from '@/lib/client/errors';
import { type Memory, trpc } from '@/lib/client/trpc';
import AppShell from '@/components/AppShell';
import AudioPlayer from '@/components/AudioPlayer';
import { useCapture } from '@/components/Capture/CaptureProvider';
import DateField from '@/components/Capture/DateField';
import Markdown from '@/components/Markdown';
import { HeartButton } from '@/components/MemoryCard';
import OfflineNotice from '@/components/OfflineNotice';
import PhotoGrid from '@/components/PhotoGrid';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import Comments from './Comments';
import Moments from './Moments';
import MoveDialog from './MoveDialog';
import PeopleTags from './PeopleTags';

interface Props {
  id: string;
}

export default function MemoryScreen({ id }: Props) {
  const router = useRouter();
  const { data: memory, error } = trpc.stories.byId.useQuery(
    { id },
    {
      refetchInterval: (q) =>
        q.state.data?.media.some((m) => m.transcriptStatus === 'pending') ? 1500 : false,
    },
  );

  const back = (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 text-muted-foreground"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(HOME_URL))}
    >
      <ChevronLeft /> Back
    </Button>
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 md:pt-6">
        {error && isConnectionError(error) ? (
          <OfflineNotice />
        ) : error ? (
          <div className="py-16 text-center">
            <p className="font-serif text-2xl">This memory isn’t available</p>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have been deleted, or it’s not shared with you.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href={HOME_URL}>Go home</Link>
            </Button>
          </div>
        ) : !memory ? (
          <div className="pt-12">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-10 w-3/4" />
            <Skeleton className="mt-8 h-40 w-full rounded-2xl" />
          </div>
        ) : (
          <MemoryBody memory={memory} back={back} />
        )}
      </main>
    </AppShell>
  );
}

function MemoryBody({ memory, back }: { memory: Memory; back: React.ReactNode }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const capture = useCapture();
  const [moving, setMoving] = useState(false);
  const refresh = () => {
    utils.stories.invalidate();
    utils.collections.list.invalidate();
  };

  const update = trpc.stories.update.useMutation({ onSuccess: refresh });
  const remove = trpc.stories.delete.useMutation({
    onSuccess: () => {
      refresh();
      toast('Memory deleted');
      router.replace(HOME_URL);
    },
  });
  const removeFromCollection = trpc.stories.removeFromCollection.useMutation({
    onSuccess: () => {
      refresh();
      toast('Removed from the collection');
      router.back();
    },
    onError: (e) => toast.error(e.message),
  });

  const texts = memory.media.filter((m) => m.kind === 'text');
  const audios = memory.media.filter((m) => m.kind === 'audio');
  const visuals = memory.media.filter((m) => m.kind === 'image' || m.kind === 'video');
  const ownedCollection = memory.collections.find((c) => c.role === 'owner' && !c.isDefault);

  const edit = () =>
    capture.editText({
      storyId: memory.id,
      mediaId: texts[0]?.id ?? null,
      markdown: texts[0]?.text ?? '',
      title: memory.title,
    });

  return (
    <article>
      <div className="flex items-center justify-between">
        {back}
        {(memory.isMine || ownedCollection) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Memory options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {memory.isMine ? (
                <>
                  <DropdownMenuItem onSelect={edit}>
                    {texts.length ? 'Edit text & title' : 'Add text or title'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMoving(true)}>Collections…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => {
                      if (
                        window.confirm('Delete this memory for everyone? This can’t be undone.')
                      ) {
                        remove.mutate({ id: memory.id });
                      }
                    }}
                  >
                    Delete memory
                  </DropdownMenuItem>
                </>
              ) : (
                ownedCollection && (
                  <DropdownMenuItem
                    onSelect={() => {
                      if (
                        window.confirm(
                          `Remove from “${ownedCollection.name}”? ${memory.author.name} keeps it.`,
                        )
                      ) {
                        removeFromCollection.mutate({
                          id: memory.id,
                          collectionId: ownedCollection.id,
                        });
                      }
                    }}
                  >
                    Remove from “{ownedCollection.name}”
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <header className="mt-4">
        {memory.isMine ? (
          <DateField
            value={memory.occurredAt}
            precision={memory.occurredPrecision}
            onChange={(occurredAt, occurredPrecision) =>
              update.mutate({ id: memory.id, occurredAt, occurredPrecision })
            }
          >
            {longDate(memory.occurredAt, memory.occurredPrecision)}
          </DateField>
        ) : (
          <p className="text-sm text-muted-foreground">
            {longDate(memory.occurredAt, memory.occurredPrecision)}
          </p>
        )}
        {memory.title && (
          <h1 className="mt-2 font-serif text-4xl font-medium leading-tight tracking-tight">
            {memory.title}
          </h1>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <UserAvatar name={memory.author.name} image={memory.author.image} className="size-6" />
          <span className="text-foreground">{memory.isMine ? 'You' : memory.author.name}</span>
          {memory.collections.length > 0 && <span>in</span>}
          {memory.collections.map((c, i) => (
            <span key={c.id}>
              <Link
                href={collectionUrl(c.id)}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                {c.name}
              </Link>
              {i < memory.collections.length - 1 && ','}
            </span>
          ))}
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-6">
        {memory.clips.map((clip) => (
          <section key={`${clip.mediaId}-${clip.startMs}`} className="flex flex-col gap-2">
            <AudioPlayer src={clip.url} startMs={clip.startMs} endMs={clip.endMs} size="large" />
            <p className="text-sm text-muted-foreground">
              From{' '}
              <Link
                href={memoryUrl(clip.source.id)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {clip.source.title ? `“${clip.source.title}”` : 'a conversation'}
              </Link>{' '}
              · {longDate(clip.source.occurredAt, clip.source.occurredPrecision)}
            </p>
          </section>
        ))}
        {memory.media.map((item) => {
          if (item.kind === 'text') return <Markdown key={item.id}>{item.text ?? ''}</Markdown>;
          if (item.kind === 'audio')
            return <AudioBlock key={item.id} memory={memory} item={item} />;
          return null;
        })}
        {visuals.length > 0 && <PhotoGrid items={visuals} variant="full" />}
        {!texts.length && !audios.length && !visuals.length && !memory.clips.length && (
          <p className="text-muted-foreground">This memory is empty.</p>
        )}
      </div>

      {audios.length > 0 && <Moments memory={memory} className="mt-10" />}

      <PeopleTags memory={memory} className="mt-8" />

      <div className="mt-6 flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <HeartButton memory={memory} className="-ml-2" />
      </div>

      <Comments storyId={memory.id} className="mt-4" />

      {moving && <MoveDialog memory={memory} open={moving} onOpenChange={setMoving} />}
    </article>
  );
}

function AudioBlock({ memory, item }: { memory: Memory; item: Memory['media'][number] }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text ?? '');
  const updateText = trpc.media.updateText.useMutation({
    onSuccess: () => {
      setEditing(false);
      utils.stories.invalidate();
    },
  });
  const retry = trpc.media.transcribe.useMutation({
    onSuccess: () => utils.stories.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="flex flex-col gap-4">
      <AudioPlayer src={item.url!} durationMs={item.durationMs} size="large" />
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-40 font-serif text-[1.1rem] leading-relaxed"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateText.mutate({ id: item.id, text: draft })}
              disabled={updateText.isPending}
            >
              {updateText.isPending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : item.transcriptStatus === 'pending' || retry.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Writing down what was said…
        </p>
      ) : item.text ? (
        <div className="group relative">
          <p className="whitespace-pre-wrap font-serif text-[1.15rem] leading-relaxed">
            {item.text}
          </p>
          {memory.isMine && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mt-1 text-muted-foreground"
              onClick={() => {
                setDraft(item.text ?? '');
                setEditing(true);
              }}
            >
              Edit transcript
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {item.transcriptStatus === 'failed'
            ? 'Couldn’t transcribe this recording.'
            : item.transcriptStatus === 'unavailable'
              ? 'No transcript — transcription isn’t set up on this server.'
              : 'No words detected.'}
          {memory.isMine && (
            <>
              {item.transcriptStatus === 'failed' && (
                <Button variant="outline" size="sm" onClick={() => retry.mutate({ id: item.id })}>
                  <RotateCcw /> Try again
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Type it yourself
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
