/**
 * Minimal audio player. Uses the duration we recorded rather than the file's
 * metadata — browser-recorded WebM often reports an infinite duration. With
 * `startMs`/`endMs` it plays just that stretch (a moment from a conversation).
 */
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatDuration } from '@/lib/client/media';
import { cn } from '@/lib/utils';

interface Props {
  src: string;
  durationMs?: number | null;
  /** Play only this stretch of the recording. */
  startMs?: number | null;
  endMs?: number | null;
  size?: 'default' | 'large';
  className?: string;
}

export default function AudioPlayer({
  src,
  durationMs,
  startMs = null,
  endMs = null,
  size = 'default',
  className,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [mediaDurationMs, setMediaDurationMs] = useState<number | null>(null);
  const range = startMs != null && endMs != null && endMs > startMs ? [startMs, endMs] : null;
  // The whole recording is a clip from 0 to forever.
  const [clipStart, clipEnd] = range ?? [0, Infinity];
  const totalMs = range ? clipEnd - clipStart : durationMs || mediaDurationMs || 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const ms = audio.currentTime * 1000;
      if (ms >= clipEnd) {
        audio.pause();
        audio.currentTime = clipStart / 1000;
        setCurrentMs(0);
        return;
      }
      setCurrentMs(Math.max(0, ms - clipStart));
    };
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setMediaDurationMs(audio.duration * 1000);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrentMs(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [clipStart, clipEnd]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // Only one memory plays at a time.
      document.querySelectorAll('audio').forEach((other) => other !== audio && other.pause());
      const ms = audio.currentTime * 1000;
      if (ms < clipStart || ms >= clipEnd) audio.currentTime = clipStart / 1000;
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  };

  const large = size === 'large';
  const fraction = totalMs ? Math.min(1, currentMs / totalMs) : 0;

  return (
    <div
      className={cn(
        'relative z-10 flex items-center gap-3 rounded-full bg-muted/70 p-1.5 pr-4',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95',
          large ? 'size-12' : 'size-9',
        )}
      >
        {playing ? (
          <Pause className={cn('fill-current', large ? 'size-5' : 'size-4')} />
        ) : (
          <Play className={cn('translate-x-px fill-current', large ? 'size-5' : 'size-4')} />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(fraction * 1000)}
        aria-label="Seek"
        onChange={(e) => {
          const audio = audioRef.current;
          if (!audio || !totalMs) return;
          audio.currentTime = (clipStart + (Number(e.target.value) / 1000) * totalMs) / 1000;
        }}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/15 accent-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
        style={{
          background: `linear-gradient(to right, hsl(var(--foreground)) ${fraction * 100}%, hsl(var(--foreground) / 0.15) ${fraction * 100}%)`,
        }}
      />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {playing || currentMs > 0 ? formatDuration(currentMs) : formatDuration(totalMs)}
      </span>
    </div>
  );
}
