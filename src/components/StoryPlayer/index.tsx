/**
 * Story mode: memories played full-screen, one at a time, from the oldest —
 * made for the TV at Thanksgiving. Photos drift slowly, a voice note plays
 * with its words underneath (long ones scroll), writing gets time to be read.
 *
 * Tap the right side for the next memory, the left for the previous, the
 * middle to pause; arrow keys, space, M (mute) and F (full screen) work too.
 * One <audio> and one <video> element are reused (switching src) so iOS keeps
 * sound after the first tap; if a browser still blocks sound, a "Tap to
 * start" screen unlocks it.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { longDate } from '@/lib/client/dates';
import { type Memory, type RouterInputs, trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import UserAvatar from '@/components/UserAvatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

type Media = Memory['media'][number];
type ListInput = RouterInputs['stories']['list'];

interface Props {
  title: string;
  /** Under the title on the opening card, e.g. who's in the collection. */
  subtitle?: string;
  /** Which memories, e.g. `{ collectionId }`. Always played oldest first. */
  filters: Omit<ListInput, 'cursor' | 'sort' | 'limit'>;
  onClose: () => void;
}

const TITLE_MS = 3500;
const PHOTO_MS = 4500;
const PHOTO_MAX_MS = 12000;
const HOLD_AFTER_AUDIO_MS = 1200;
const SEGMENTS_MAX = 40;
const PAGE = 50;

interface Plan {
  audio: Media | null;
  /** Photos and videos, in order. */
  shots: Media[];
  words: string;
  isTranscript: boolean;
  /** Slides without sound: total length, and how long each photo stays. */
  timerMs: number;
  shotMs: number;
}

type Mode = 'audio' | 'shots' | 'timer';

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Enough Markdown removed to read it aloud on a TV. */
function plainText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .trim();
}

function planFor(memory: Memory): Plan {
  const audio = memory.media.find((m) => m.kind === 'audio' && m.url) ?? null;
  const shots = memory.media.filter((m) => (m.kind === 'image' || m.kind === 'video') && m.url);
  const transcript = audio?.text?.trim() ?? '';
  const text = memory.media.find((m) => m.kind === 'text')?.text ?? '';
  const words = transcript || plainText(text);
  const wordCount = `${memory.title ?? ''} ${words}`.split(/\s+/).filter(Boolean).length;
  // About 200 words a minute, up to 40s (long ones scroll; tap to move on).
  const readMs = clamp(wordCount * 300, PHOTO_MS, 40000);
  const images = shots.filter((s) => s.kind === 'image').length;
  const hasVideo = shots.some((s) => s.kind === 'video');
  const shotMs = hasVideo || !images ? PHOTO_MS : Math.max(PHOTO_MS, readMs / images);
  return {
    audio,
    shots,
    words,
    isTranscript: !!transcript,
    timerMs: images ? Math.max(readMs, images * shotMs) : readMs,
    shotMs,
  };
}

export default function StoryPlayer({ title, subtitle, filters, onClose }: Props) {
  const query = trpc.stories.list.useInfiniteQuery(
    { ...filters, sort: 'oldest', limit: PAGE },
    { getNextPageParam: (last) => last.nextCursor, initialCursor: 0 },
  );
  const memories = query.data?.pages.flatMap((p) => p.items) ?? [];
  const hasMore = !!query.hasNextPage;

  // 0 = opening card, 1…n = memories, n + 1 = the end (or the next page, loading).
  const [index, setIndex] = useState(0);
  // Counts up through a memory's photos (and loops them under a long voice note).
  const [rawShot, setRawShot] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const [muted, setMuted] = useState(false);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [audioFailedFor, setAudioFailedFor] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const wordsBoxRef = useRef<HTMLDivElement>(null);
  const wordsRef = useRef<HTMLParagraphElement>(null);
  const elapsed = useRef(0);
  const hold = useRef(0);
  const playingRef = useRef(playing);
  const mutedRef = useRef(muted);

  const memory = index >= 1 ? memories[index - 1] : undefined;
  const plan = memory ? planFor(memory) : null;
  const mode: Mode | null = !plan
    ? null
    : plan.audio && audioFailedFor !== memory?.id
      ? 'audio'
      : plan.shots.some((s) => s.kind === 'video')
        ? 'shots'
        : 'timer';
  const shot = plan?.shots.length ? plan.shots[rawShot % plan.shots.length] : null;
  const atEnd = index > memories.length && !hasMore && !query.isPending;
  const loadingNext = index > memories.length && (hasMore || query.isPending);
  const slideKey = memory?.id ?? `slide-${index}`;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    mutedRef.current = muted;
    if (audioRef.current) audioRef.current.muted = muted;
    if (videoRef.current && mode !== 'audio') videoRef.current.muted = muted;
  }, [muted, mode]);

  const tryPlay = useCallback((el: HTMLMediaElement) => {
    el.play().catch((error: unknown) => {
      // Sound needs a tap first in some browsers (iOS, a TV browser): ask for one.
      if (error instanceof DOMException && error.name === 'NotAllowedError') setNeedsTap(true);
    });
  }, []);

  const go = (next: number) => {
    elapsed.current = 0;
    hold.current = 0;
    // Moving on, React fills the finished segment; moving back, this one must empty.
    if (fillRef.current) fillRef.current.style.transform = 'scaleX(0)';
    setRawShot(0);
    setIndex(clamp(next, 0, memories.length + 1));
  };

  const nextShot = () => {
    elapsed.current = 0;
    if (!plan || rawShot + 1 >= plan.shots.length) go(index + 1);
    else setRawShot(rawShot + 1);
  };

  const segmented = !hasMore && memories.length > 0 && memories.length <= SEGMENTS_MAX;
  const setFill = (fraction: number) => {
    const total = memories.length;
    const el = fillRef.current;
    if (!el || !total) return;
    const f = clamp(fraction, 0, 1);
    // One bar per memory, or one long bar when there are many.
    el.style.transform = `scaleX(${segmented ? f : (index - 1 + f) / total})`;
  };

  // The clock: one frame at a time while playing.
  const step = (dt: number) => {
    if (index === 0) {
      if (query.isPending) return; // wait for the first memories
      elapsed.current += dt;
      if (elapsed.current >= TITLE_MS) go(1);
      return;
    }
    if (!plan || !mode) return;
    if (mode === 'audio') {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.ended) {
        setFill(1);
        hold.current += dt;
        if (hold.current >= HOLD_AFTER_AUDIO_MS) go(index + 1);
        return;
      }
      const totalMs =
        plan.audio?.durationMs || (Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
      const ms = audio.currentTime * 1000;
      setFill(totalMs ? ms / totalMs : 0);
      if (plan.shots.length) {
        const per = totalMs ? clamp(totalMs / plan.shots.length, PHOTO_MS, PHOTO_MAX_MS) : PHOTO_MS;
        const next = Math.floor(ms / per);
        if (next !== rawShot) setRawShot(next);
      }
      return;
    }
    if (mode === 'shots') {
      const current = plan.shots[rawShot];
      if (!current) return go(index + 1);
      if (current.kind === 'video') {
        const video = videoRef.current;
        const f =
          video && video.duration > 0 && Number.isFinite(video.duration)
            ? video.currentTime / video.duration
            : 0;
        setFill((rawShot + f) / plan.shots.length);
        return; // the video's `ended` moves on
      }
      elapsed.current += dt;
      setFill((rawShot + Math.min(1, elapsed.current / PHOTO_MS)) / plan.shots.length);
      if (elapsed.current >= PHOTO_MS) nextShot();
      return;
    }
    elapsed.current += dt;
    setFill(elapsed.current / plan.timerMs);
    if (plan.shots.length) {
      const next = Math.floor(elapsed.current / plan.shotMs);
      if (next !== rawShot && next < plan.shots.length) setRawShot(next);
    }
    if (elapsed.current >= plan.timerMs) go(index + 1);
  };
  const stepRef = useRef(step);
  useLayoutEffect(() => {
    stepRef.current = step;
  });

  useEffect(() => {
    if (!playing || needsTap) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      stepRef.current(Math.min(now - last, 250)); // a hidden tab doesn't jump ahead
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, needsTap]);

  // Keep the next page coming before it's needed.
  useEffect(() => {
    if (hasMore && !query.isFetchingNextPage && index >= memories.length - 2) query.fetchNextPage();
  }, [hasMore, index, memories.length, query]);

  // The voice note for this memory.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (mode !== 'audio' || !plan?.audio?.url) {
      audio.pause();
      audio.removeAttribute('src');
      return;
    }
    audio.src = plan.audio.url;
    audio.muted = mutedRef.current;
    if (playingRef.current) tryPlay(audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per memory
  }, [slideKey, mode]);

  // A video shot: silent and looping under a voice note, otherwise played through with sound.
  const shotKey = shot?.kind === 'video' ? `${slideKey}-${rawShot}` : null;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shot || shot.kind !== 'video' || !shot.url) {
      video.pause();
      video.removeAttribute('src');
      return;
    }
    video.src = shot.url;
    video.loop = mode === 'audio';
    video.muted = mode === 'audio' || mutedRef.current;
    if (playingRef.current) tryPlay(video);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per video shot
  }, [shotKey]);

  // Pause and resume everything together.
  useEffect(() => {
    for (const el of [audioRef.current, videoRef.current]) {
      if (!el?.getAttribute('src') || el.ended) continue;
      if (playing && !needsTap) tryPlay(el);
      else el.pause();
    }
  }, [playing, needsTap, tryPlay]);

  // Long words scroll up slowly while the memory plays.
  const scrollMs =
    mode === 'audio'
      ? (plan?.audio?.durationMs ?? 0) - 3000
      : mode === 'timer'
        ? (plan?.timerMs ?? 0) - 3000
        : 0;
  useLayoutEffect(() => {
    const box = wordsBoxRef.current;
    const words = wordsRef.current;
    if (!box || !words) return;
    // The class (not an inline `animation`) so Tailwind emits the keyframes.
    words.classList.remove('animate-story-scroll');
    const overflow = words.scrollHeight - box.clientHeight;
    if (overflow > 8 && scrollMs > 4000) {
      void words.offsetHeight; // restart the animation
      words.style.setProperty('--story-scroll', `-${overflow + 24}px`);
      words.style.animationDuration = `${scrollMs}ms`;
      words.style.animationDelay = '2500ms';
      words.style.animationPlayState = playingRef.current ? 'running' : 'paused';
      words.classList.add('animate-story-scroll');
    }
  }, [slideKey, scrollMs]);
  useEffect(() => {
    if (wordsRef.current)
      wordsRef.current.style.animationPlayState = playing && !needsTap ? 'running' : 'paused';
  }, [playing, needsTap]);

  // Other players on the page stop; controls hide when nobody's touching anything.
  useEffect(() => {
    document.querySelectorAll('audio').forEach((a) => a !== audioRef.current && a.pause());
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 2500);
    };
    timer = setTimeout(() => setIdle(true), 2500);
    // pointerdown too: on a phone a tap is the only "movement".
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      document.removeEventListener('fullscreenchange', onFullscreen);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Warm the next memory's first photo and voice note.
  useEffect(() => {
    const next = memories[index];
    if (!next) return;
    const nextPlan = planFor(next);
    const firstImage = nextPlan.shots.find((s) => s.kind === 'image');
    if (firstImage?.url) new Image().src = firstImage.url;
    if (nextPlan.audio?.url)
      fetch(nextPlan.audio.url, { credentials: 'same-origin' }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per slide
  }, [index, memories.length]);

  const togglePlay = () => {
    if (atEnd) return;
    setPlaying((p) => !p);
  };
  const unlock = () => {
    setNeedsTap(false);
    setPlaying(true);
    // Inside the tap, so the browser lets the sound start.
    for (const el of [audioRef.current, videoRef.current]) {
      if (el?.getAttribute('src') && !el.ended) el.play().catch(() => {});
    }
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen?.().catch(() => {});
  };
  const restart = () => {
    setPlaying(true);
    go(0);
  };

  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
  const hideChrome = idle && playing && !atEnd && !needsTap;
  const people = memory?.people.map((p) => p.name).join(', ');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        ref={rootRef}
        hideClose
        className={cn(
          'max-w-none overflow-hidden border-0 bg-black p-0 text-white outline-none sm:rounded-none',
          hideChrome && 'cursor-none',
        )}
        style={{ width: '100vw', height: '100dvh' }}
        // Focus the player itself (keys work), not the invisible tap zones.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          rootRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(index + 1);
          else if (e.key === 'ArrowLeft') go(index - 1);
          else if (e.key === ' ' || e.key === 'k') {
            e.preventDefault();
            togglePlay();
          } else if (e.key === 'm') setMuted((m) => !m);
          else if (e.key === 'f' && canFullscreen) toggleFullscreen();
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Memories played one at a time, from the oldest
        </DialogDescription>

        <audio
          ref={audioRef}
          preload="auto"
          onError={() =>
            memory && audioRef.current?.getAttribute('src') && setAudioFailedFor(memory.id)
          }
        />

        {/* One shared video element (see the note at the top), under the slide's words. */}
        <video
          ref={videoRef}
          playsInline
          className={cn(
            'absolute inset-0 size-full bg-black object-contain',
            shot?.kind !== 'video' && 'hidden',
          )}
          onEnded={() => mode === 'shots' && nextShot()}
          onError={() => mode === 'shots' && videoRef.current?.getAttribute('src') && nextShot()}
        />

        {/* ---------- The slide ---------- */}
        <div key={slideKey} className="absolute inset-0 duration-700 animate-in fade-in-0">
          {index === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="mb-10 h-[3px] w-12 rounded-full bg-white" />
              <h2 className="max-w-4xl font-serif text-5xl font-medium leading-[1.05] tracking-tight sm:text-7xl">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-6 max-w-xl font-serif text-xl text-white/70 sm:text-2xl">
                  {subtitle}
                </p>
              )}
              {query.isPending && <Loader2 className="mt-10 size-5 animate-spin text-white/50" />}
            </div>
          )}

          {memory && plan && (
            <>
              {plan.shots.length > 0 && shot?.kind !== 'video' && (
                <div className="absolute inset-0">
                  {[rawShot - 1, rawShot]
                    .filter((r) => r >= 0)
                    .map((r) => {
                      const media = plan.shots[r % plan.shots.length];
                      const isCurrent = r === rawShot;
                      if (media.kind === 'video') return null; // the shared <video> below
                      const perShot =
                        mode === 'audio' && plan.audio?.durationMs
                          ? clamp(plan.audio.durationMs / plan.shots.length, PHOTO_MS, PHOTO_MAX_MS)
                          : mode === 'timer'
                            ? plan.shotMs
                            : PHOTO_MS;
                      return (
                        <div
                          key={`${slideKey}-${r}`}
                          // Opaque, so the photo underneath only shows while this one fades in.
                          className={cn(
                            'absolute inset-0 overflow-hidden bg-black',
                            isCurrent && 'duration-1000 animate-in fade-in-0',
                          )}
                        >
                          <img
                            src={media.url!}
                            alt=""
                            aria-hidden
                            className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl"
                          />
                          <img
                            src={media.url!}
                            alt=""
                            className={cn(
                              'absolute inset-0 size-full object-contain motion-reduce:animate-none',
                              r % 2 ? 'animate-ken-burns-out' : 'animate-ken-burns-in',
                            )}
                            style={{
                              animationDuration: `${perShot + 1000}ms`,
                              animationPlayState: playing && !needsTap ? 'running' : 'paused',
                            }}
                          />
                        </div>
                      );
                    })}
                </div>
              )}

              {plan.shots.length > 0 ? (
                // Words over the picture, at the bottom.
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-6 pb-[max(2.5rem,calc(env(safe-area-inset-bottom)+1.5rem))] pt-28 sm:px-12">
                  <div className="mx-auto max-w-3xl">
                    <Byline memory={memory} sound={mode === 'audio' && playing && !needsTap} />
                    {memory.title && (
                      <h2 className="mt-3 font-serif text-3xl font-medium leading-tight sm:text-5xl">
                        {memory.title}
                      </h2>
                    )}
                    {plan.words && (
                      <div
                        ref={wordsBoxRef}
                        className="mt-3 max-h-[24vh] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]"
                      >
                        <p
                          ref={wordsRef}
                          className={cn(
                            'whitespace-pre-line py-2 font-serif text-lg leading-relaxed text-white/90 sm:text-2xl',
                            plan.isTranscript && 'italic',
                          )}
                        >
                          {plan.isTranscript ? `“${plan.words}”` : plan.words}
                        </p>
                      </div>
                    )}
                    {people && <p className="mt-3 text-sm text-white/60">with {people}</p>}
                  </div>
                </div>
              ) : (
                // Just words (and maybe a voice): big, centred, like a page.
                <div className="flex h-full items-center justify-center px-8 py-24 sm:px-16">
                  <div className="w-full max-w-3xl">
                    <Byline memory={memory} sound={mode === 'audio' && playing && !needsTap} />
                    {memory.title && (
                      <h2 className="mt-5 font-serif text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
                        {memory.title}
                      </h2>
                    )}
                    {plan.words && (
                      <div
                        ref={wordsBoxRef}
                        className="mt-6 max-h-[50vh] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_6%,black_92%,transparent)]"
                      >
                        <p
                          ref={wordsRef}
                          className={cn(
                            'whitespace-pre-line py-3 font-serif text-2xl leading-snug text-white/90 sm:text-4xl sm:leading-snug',
                            plan.isTranscript && 'italic',
                          )}
                        >
                          {plan.isTranscript ? `“${plan.words}”` : plan.words}
                        </p>
                      </div>
                    )}
                    {people && <p className="mt-6 text-sm text-white/60">with {people}</p>}
                  </div>
                </div>
              )}
            </>
          )}

          {loadingNext && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-white/60" aria-label="Loading" />
            </div>
          )}

          {atEnd && (
            <div className="relative z-20 flex h-full flex-col items-center justify-center px-8 text-center">
              <div className="mb-10 h-[3px] w-12 rounded-full bg-white" />
              <h2 className="font-serif text-5xl font-medium tracking-tight sm:text-7xl">
                {memories.length ? 'The end' : 'Nothing to play yet'}
              </h2>
              <p className="mt-5 font-serif text-xl text-white/60">
                {memories.length
                  ? `${title} · ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`
                  : 'Add a memory and it will play here.'}
              </p>
              <div className="mt-10 flex gap-3">
                {memories.length > 0 && (
                  <button
                    type="button"
                    onClick={restart}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-medium text-black"
                  >
                    <RotateCcw className="size-4" /> Play again
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 items-center rounded-full border border-white/30 px-5 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ---------- Tap zones: left back, right forward, middle pause ---------- */}
        {!atEnd && (
          <>
            <button
              type="button"
              aria-label="Previous memory"
              className="absolute inset-y-20 left-0 z-10 w-1/3 cursor-[inherit] focus:outline-none"
              tabIndex={-1}
              onClick={() => go(index - 1)}
            />
            <button
              type="button"
              aria-label={playing ? 'Pause' : 'Play'}
              className="absolute inset-y-20 left-1/3 z-10 w-1/3 cursor-[inherit] focus:outline-none"
              tabIndex={-1}
              onClick={togglePlay}
            />
            <button
              type="button"
              aria-label="Next memory"
              className="absolute inset-y-20 right-0 z-10 w-1/3 cursor-[inherit] focus:outline-none"
              tabIndex={-1}
              onClick={() => go(index + 1)}
            />
          </>
        )}
        {!playing && !atEnd && !needsTap && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-black/50 p-5 backdrop-blur-sm">
              <Play className="size-8 fill-current" />
            </span>
          </div>
        )}

        {/* ---------- Top: progress and controls ---------- */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/50 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-500',
            hideChrome && 'opacity-0',
          )}
        >
          {memories.length > 0 && index >= 1 && (
            <div className="flex h-0.5 gap-1" aria-hidden>
              {segmented ? (
                memories.map((m, i) => (
                  <span
                    key={m.id}
                    className="relative h-full flex-1 overflow-hidden rounded-full bg-white/25"
                  >
                    <span
                      ref={i === index - 1 ? fillRef : undefined}
                      className="absolute inset-0 origin-left bg-white"
                      style={{ transform: `scaleX(${i < index - 1 ? 1 : 0})` }}
                    />
                  </span>
                ))
              ) : (
                <span className="relative h-full flex-1 overflow-hidden rounded-full bg-white/25">
                  <span
                    ref={fillRef}
                    className="absolute inset-0 origin-left bg-white"
                    style={{ transform: 'scaleX(0)' }}
                  />
                </span>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate pl-1 text-sm font-medium text-white/80">
              {title}
              {index >= 1 && index <= memories.length && (
                <span className="font-normal text-white/50">
                  {' '}
                  · {index} of {memories.length}
                  {hasMore ? '+' : ''}
                </span>
              )}
            </p>
            {!atEnd && (
              <ControlButton label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
                {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
              </ControlButton>
            )}
            <ControlButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((m) => !m)}>
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </ControlButton>
            {canFullscreen && (
              <ControlButton
                label={fullscreen ? 'Exit full screen' : 'Full screen'}
                onClick={toggleFullscreen}
              >
                {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </ControlButton>
            )}
            <ControlButton label="Close" onClick={onClose}>
              <X className="size-5" />
            </ControlButton>
          </div>
        </div>

        {needsTap && (
          <button
            type="button"
            onClick={unlock}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm"
          >
            <span className="rounded-full bg-white p-5 text-black">
              <Play className="size-8 fill-current" />
            </span>
            <span className="text-sm text-white/80">Tap to play with sound</span>
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Byline({ memory, sound }: { memory: Memory; sound: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-white/75">
      <UserAvatar
        name={memory.author.name}
        image={memory.author.image}
        className="size-7 [&>span]:bg-white/15 [&>span]:text-white"
      />
      <span className="min-w-0 truncate">
        <span className="font-medium text-white">{memory.author.name}</span> ·{' '}
        {longDate(memory.occurredAt, memory.occurredPrecision)}
      </span>
      {sound && (
        <span className="ml-1 flex h-3.5 items-end gap-[3px]" aria-label="Playing">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-full w-[3px] origin-bottom animate-sound-bar rounded-full bg-white/80 motion-reduce:animate-none"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/15"
    >
      {children}
    </button>
  );
}
