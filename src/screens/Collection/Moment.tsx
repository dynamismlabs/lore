/**
 * One memory on a collection page, laid out like a page in a book: who and
 * when in small caps, the title large, a voice note quoted, photos big. The
 * whole memory opens it; the player and heart stay usable.
 */
import { format } from 'date-fns';
import { Loader2, MessageCircle, Play } from 'lucide-react';
import Link from 'next/link';
import { memoryUrl } from '@/constants/pages';
import type { Memory } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import AudioPlayer from '@/components/AudioPlayer';
import Markdown from '@/components/Markdown';
import { HeartButton, memorySummary } from '@/components/MemoryCard';
import UserAvatar from '@/components/UserAvatar';

type Media = Memory['media'][number];

interface Props {
  memory: Memory;
}

export default function Moment({ memory }: Props) {
  const text = memory.media.find((m) => m.kind === 'text');
  const audio = memory.media.find((m) => m.kind === 'audio');
  const visuals = memory.media.filter((m) => m.kind === 'image' || m.kind === 'video');

  return (
    <article className="group relative">
      <Link
        href={memoryUrl(memory.id)}
        className="absolute -inset-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open memory: ${memorySummary(memory) || 'untitled'}`}
      />

      <header className="flex items-center gap-3">
        <UserAvatar name={memory.author.name} image={memory.author.image} className="size-9" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium">{memory.isMine ? 'You' : memory.author.name}</p>
          <time
            dateTime={memory.occurredAt.toISOString()}
            className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
          >
            {format(memory.occurredAt, 'EEEE · MMMM d')}
          </time>
        </div>
      </header>

      {memory.title && (
        <h2 className="mt-6 text-balance font-serif text-3xl font-medium leading-tight tracking-tight decoration-foreground/25 underline-offset-[6px] group-hover:underline sm:text-[2.5rem] sm:leading-[1.1]">
          {memory.title}
        </h2>
      )}

      {audio?.url && (
        <div className="mt-6">
          <AudioPlayer src={audio.url} durationMs={audio.durationMs} className="max-w-sm" />
          {audio.transcriptStatus === 'pending' ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Transcribing…
            </p>
          ) : (
            audio.text && (
              <blockquote className="mt-6 line-clamp-[9] border-l border-foreground/25 pl-5 font-serif text-xl italic leading-relaxed text-foreground/85 sm:pl-6 sm:text-2xl sm:leading-relaxed">
                “{audio.text}”
              </blockquote>
            )
          )}
        </div>
      )}

      {text?.text && (
        <div className="mt-5 line-clamp-[12]">
          <Markdown className="text-lg sm:text-xl sm:leading-relaxed">{text.text}</Markdown>
        </div>
      )}

      {visuals.length > 0 && <Mosaic items={visuals} className="mt-7" />}

      <footer className="mt-6 flex items-center gap-1 text-sm text-muted-foreground">
        <HeartButton memory={memory} className="-ml-2" />
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

/** Photos big: one at its own shape, two side by side, three or more as a mosaic. */
function Mosaic({ items, className }: { items: Media[]; className?: string }) {
  if (items.length === 1) {
    const [item] = items;
    const ratio = item.width && item.height ? item.width / item.height : 4 / 3;
    return (
      <div
        className={cn('relative overflow-hidden rounded-2xl bg-muted', className)}
        // Portraits are trimmed to 4:5 so one photo can't fill three screens.
        style={{ aspectRatio: Math.max(ratio, 0.8) }}
      >
        <Tile item={item} />
      </div>
    );
  }
  if (items.length === 2) {
    return (
      <div className={cn('grid grid-cols-2 gap-2', className)}>
        {items.map((item) => (
          <div key={item.id} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
            <Tile item={item} />
          </div>
        ))}
      </div>
    );
  }
  const extra = items.length - 3;
  return (
    <div className={cn('grid h-[20rem] grid-cols-3 grid-rows-2 gap-2 sm:h-[30rem]', className)}>
      <div className="relative col-span-2 row-span-2 overflow-hidden rounded-2xl bg-muted">
        <Tile item={items[0]} />
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <Tile item={items[1]} />
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <Tile item={items[2]} />
        {extra > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45 font-serif text-2xl text-white">
            +{extra}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ item }: { item: Media }) {
  if (item.kind === 'video') {
    return (
      <>
        <video
          src={`${item.url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
        <span className="absolute left-3 top-3 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm">
          <Play className="size-3.5 fill-current" />
        </span>
      </>
    );
  }
  return (
    <img
      src={item.url!}
      alt=""
      loading="lazy"
      className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.015]"
    />
  );
}
