/**
 * Plays vibes back to back — a week, a month or a year of life in a few
 * minutes. One <video> element (switching src) so iOS keeps playing
 * after the first tap.
 */
import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Play, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export interface SecondClip {
  id: string;
  url: string;
  occurredAt: Date;
  author: { name: string };
  isMine: boolean;
}

interface Props {
  clips: SecondClip[];
  title: string;
  startIndex?: number;
  onClose: () => void;
}

export default function SecondsPlayer({ clips, title, startIndex = 0, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  const clip = clips[index];
  const showAuthors = clips.some((c) => !c.isMine);

  // Warm the cache for the next couple of clips so playback doesn't stutter.
  useEffect(() => {
    for (const next of clips.slice(index + 1, index + 3)) {
      fetch(next.url, { credentials: 'same-origin' }).catch(() => {});
    }
  }, [clips, index]);

  if (!clip) return null;

  const advance = (delta: number) => {
    const next = index + delta;
    if (next >= clips.length) {
      setPlaying(false);
      setIndex(0);
      return;
    }
    setIndex(Math.max(0, next));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        hideClose
        className="max-w-none border-0 bg-black p-0 text-white sm:rounded-none"
        style={{ width: '100vw', height: '100dvh' }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">Plays the clips in order</DialogDescription>
        <div className="relative flex size-full items-center justify-center">
          <video
            ref={videoRef}
            src={clip.url}
            playsInline
            // Start each clip as soon as it can play (the element is reused, so
            // iOS keeps the permission from the first tap).
            onCanPlay={(e) => {
              if (playingRef.current) e.currentTarget.play().catch(() => setPlaying(false));
            }}
            className="max-h-full max-w-full object-contain"
            onEnded={() => advance(1)}
            onError={() => advance(1)}
          />

          {/* Progress segments */}
          <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex gap-0.5">
            {clips.length <= 120 &&
              clips.map((c, i) => (
                <span
                  key={c.id}
                  className={cn(
                    'h-0.5 flex-1 rounded-full',
                    i <= index ? 'bg-white' : 'bg-white/30',
                  )}
                />
              ))}
          </div>
          <div className="absolute left-4 top-[max(1.5rem,calc(env(safe-area-inset-top)+0.75rem))] text-sm font-medium drop-shadow">
            {format(clip.occurredAt, 'EEE, MMM d, yyyy')}
            {showAuthors && (
              <span className="font-normal text-white/70"> · {clip.author.name}</span>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute right-3 top-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))] rounded-full bg-white/15 p-2"
          >
            <X className="size-5" />
          </button>

          {/* Tap left/right to skip, center to pause */}
          <button
            type="button"
            aria-label="Previous"
            className="absolute inset-y-16 left-0 w-1/3"
            onClick={() => advance(-1)}
          />
          <button
            type="button"
            aria-label="Next"
            className="absolute inset-y-16 right-0 w-1/3"
            onClick={() => advance(1)}
          />
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            className="absolute inset-y-16 left-1/3 w-1/3"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (playing) {
                video.pause();
                setPlaying(false);
              } else {
                setPlaying(true);
                video.play().catch(() => {});
              }
            }}
          />
          {!playing && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/50 p-5">
                <Play className="size-8 fill-current" />
              </span>
            </div>
          )}
          <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] text-xs text-white/60">
            {index + 1} / {clips.length} · {title}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
