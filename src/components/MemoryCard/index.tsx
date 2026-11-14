/**
 * A memory in a feed: no box, just space and a thin divider between memories
 * (the feed draws the dividers). The whole memory opens it; controls stay usable.
 */
import { Heart, Loader2, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { memoryUrl } from '@/constants/pages';
import { friendlyDate } from '@/lib/client/dates';
import { type Memory, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import AudioPlayer from '@/components/AudioPlayer';
import Markdown from '@/components/Markdown';
import PhotoGrid from '@/components/PhotoGrid';
import UserAvatar from '@/components/UserAvatar';

interface Props {
  memory: Memory;
  /** Hide the collection label (already inside that collection). */
  hideCollection?: boolean;
}

export function memorySummary(memory: Memory) {
  const text = memory.media.find((m) => m.kind === 'text')?.text;
  const transcript = memory.media.find((m) => m.kind === 'audio')?.text;
  return (memory.title || text || transcript || '').slice(0, 140);
}

export default function MemoryCard({ memory, hideCollection = false }: Props) {
  const texts = memory.media.filter((m) => m.kind === 'text');
  const audios = memory.media.filter((m) => m.kind === 'audio');
  const visuals = memory.media.filter((m) => m.kind === 'image' || m.kind === 'video');
  const collection = memory.collections[0];
  const label = memory.title || (texts.length || audios.length ? null : 'Photos');

  return (
    <article className="group relative py-7 first:pt-2">
      <header className="mb-3 flex items-center gap-2.5 text-sm">
        <UserAvatar name={memory.author.name} image={memory.author.image} className="size-7" />
        <div className="min-w-0 flex-1 truncate text-muted-foreground">
          <span className="font-medium text-foreground">
            {memory.isMine ? 'You' : memory.author.name}
          </span>
          {!hideCollection && collection && (
            <>
              {' · '}
              <span>{collection.name}</span>
            </>
          )}
        </div>
        <time
          className="shrink-0 text-xs text-muted-foreground"
          dateTime={memory.occurredAt.toISOString()}
        >
          {friendlyDate(memory.occurredAt)}
        </time>
      </header>

      {/* Covers the whole card; buttons/players sit above it (z-10). */}
      <Link
        href={memoryUrl(memory.id)}
        className="absolute inset-0 -mx-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open memory: ${memorySummary(memory) || 'untitled'}`}
      />
      {label && (
        <h2 className="mb-2 font-serif text-[1.35rem] font-medium leading-snug decoration-foreground/30 underline-offset-4 group-hover:underline">
          {label}
        </h2>
      )}

      <div className="flex flex-col gap-3">
        {texts.slice(0, 1).map((t) => (
          <div key={t.id} className="line-clamp-5">
            <Markdown className="text-[1.02rem] prose-p:my-1.5">{t.text ?? ''}</Markdown>
          </div>
        ))}
        {audios.slice(0, 1).map((a) => (
          <div key={a.id} className="flex flex-col gap-2">
            <AudioPlayer src={a.url!} durationMs={a.durationMs} />
            {a.transcriptStatus === 'pending' ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Transcribing…
              </p>
            ) : (
              a.text && (
                <p className="line-clamp-3 font-serif text-[1.02rem] leading-relaxed text-foreground/85">
                  {a.text}
                </p>
              )
            )}
          </div>
        ))}
        {visuals.length > 0 && <PhotoGrid items={visuals} />}
      </div>

      <footer className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
        <HeartButton memory={memory} />
        <span className="inline-flex items-center gap-1.5 px-2 py-1">
          <MessageCircle className="size-4" />
          {memory.commentCount > 0 && memory.commentCount}
        </span>
        {memory.people.length > 0 && (
          <span className="ml-auto truncate text-xs">
            with {memory.people.map((p) => p.name).join(', ')}
          </span>
        )}
      </footer>
    </article>
  );
}

export function HeartButton({ memory, className }: { memory: Memory; className?: string }) {
  const utils = trpc.useUtils();
  const toggle = trpc.reactions.toggleHeart.useMutation({
    onMutate: () => {
      // Optimistic on the detail view; feeds refresh right after.
      const patch = (m: Memory) =>
        m.id === memory.id
          ? {
              ...m,
              heartedByMe: !m.heartedByMe,
              heartCount: m.heartCount + (m.heartedByMe ? -1 : 1),
            }
          : m;
      utils.stories.byId.setData({ id: memory.id }, (m) => (m ? patch(m) : m));
    },
    onSettled: () => {
      utils.stories.byId.invalidate({ id: memory.id });
      utils.stories.list.invalidate();
    },
  });
  return (
    <button
      type="button"
      onClick={() => toggle.mutate({ storyId: memory.id })}
      aria-pressed={memory.heartedByMe}
      aria-label={memory.heartedByMe ? 'Remove heart' : 'Heart this memory'}
      className={cn(
        'relative z-10 inline-flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors hover:bg-accent hover:text-foreground',
        memory.heartedByMe && 'text-foreground',
        className,
      )}
    >
      <Heart className={cn('size-4', memory.heartedByMe && 'fill-current')} />
      {memory.heartCount > 0 && memory.heartCount}
    </button>
  );
}
