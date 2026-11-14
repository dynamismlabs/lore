/**
 * Tap → talk → tap. Recording starts the moment this opens; stopping keeps it
 * on this device and uploads it (so nothing is ever lost, signal or not), then
 * the transcript fills in.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CloudOff,
  Download,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  X,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { memoryUrl } from '@/constants/pages';
import { resolveDefaultCollectionId } from '@/lib/client/device';
import { formatDuration } from '@/lib/client/media';
import { trpc } from '@/lib/client/trpc';
import { useOnline } from '@/hooks/useOnline';
import { useRecorder } from '@/hooks/useRecorder';
import { useViewer } from '@/hooks/useViewer';
import { useOutbox } from '@/components/Outbox/OutboxProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CaptureDialog from './CaptureDialog';
import CollectionSelect from './CollectionSelect';

interface Props {
  collectionId?: string;
  onClose: () => void;
}

type Phase = 'record' | 'saving' | 'saved' | 'queued' | 'failed';

export default function VoiceRecorder({ collectionId: initialCollectionId, onClose }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { viewer } = useViewer();
  const recorder = useRecorder();
  const outbox = useOutbox();
  const online = useOnline();
  const [collectionId, setCollectionId] = useState(
    () => initialCollectionId ?? resolveDefaultCollectionId(viewer?.id),
  );
  const [phase, setPhase] = useState<Phase>('record');
  const [progress, setProgress] = useState(0);
  const [storyId, setStoryId] = useState<string | null>(null);
  /** Set once the recording is safe on this device (it's also the memory's id). */
  const [keptId, setKeptId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const recordingRef = useRef<{ blob: Blob; durationMs: number; endedAt: number } | null>(null);

  const updateStory = trpc.stories.update.useMutation();

  const { data: saved } = trpc.stories.byId.useQuery(
    { id: storyId ?? '' },
    {
      enabled: !!storyId,
      refetchInterval: (query) =>
        query.state.data?.media.some((m) => m.transcriptStatus === 'pending') ? 1500 : false,
    },
  );
  const audio = saved?.media.find((m) => m.kind === 'audio');

  const { start } = recorder;
  useEffect(() => {
    void start();
  }, [start]);

  const save = async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    setPhase('saving');
    setProgress(0);
    setFailure(null);
    try {
      // The transcript is requested once it's uploaded (by the outbox), so it
      // finishes even if this is closed.
      const result = keptId
        ? await outbox.retry(keptId)
        : await outbox.save(
            {
              kind: 'voice',
              collectionId,
              occurredAt: recording.endedAt,
              media: [{ kind: 'audio', blob: recording.blob, durationMs: recording.durationMs }],
            },
            { onProgress: setProgress, onKept: setKeptId },
          );
      if (!result || result.status === 'queued') {
        setPhase('queued');
      } else if (result.status === 'failed') {
        setFailure(result.error);
        setPhase('failed');
      } else {
        setStoryId(result.story.id);
        setPhase('saved');
      }
    } catch (error) {
      // Not kept on this device (no storage here) and the upload failed.
      console.error(error);
      setPhase('failed');
    }
  };

  const stopAndSave = async () => {
    const recording = await recorder.stop();
    recordingRef.current = { ...recording, endedAt: Date.now() };
    await save();
  };

  /** It's safe on this device: let it finish uploading without you. */
  const closeWhileUploading = () => {
    if (keptId) outbox.detach(keptId);
    onClose();
  };

  const requestClose = () => {
    if (phase === 'saving') {
      if (keptId) closeWhileUploading();
      return;
    }
    if (
      (recorder.state === 'recording' || recorder.state === 'paused') &&
      recorder.elapsedMs > 3000
    ) {
      if (!window.confirm('Discard this recording?')) return;
    }
    if (
      phase === 'failed' &&
      !keptId &&
      !window.confirm('This recording hasn’t been saved. Discard it?')
    )
      return;
    recorder.discard();
    onClose();
  };

  const finish = async (open: boolean) => {
    const name = title.trim();
    if (name && storyId) {
      await updateStory.mutateAsync({ id: storyId, title: name }).catch(() => {});
      utils.stories.invalidate();
    } else if (name && keptId) {
      // Still waiting? Name it on this device. Already sent (the id is the memory's)? Rename that.
      if (outbox.items.some((item) => item.id === keptId))
        await outbox.rename(keptId, name).catch(() => {});
      else await updateStory.mutateAsync({ id: keptId, title: name }).catch(() => {});
    }
    onClose();
    if (open && storyId) router.push(memoryUrl(storyId));
  };

  const downloadRecording = () => {
    const recording = recordingRef.current;
    if (!recording) return;
    const url = URL.createObjectURL(recording.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lore-recording-${new Date().toISOString().slice(0, 16)}.${recording.blob.type.includes('mp4') ? 'm4a' : 'webm'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const isLive = recorder.state === 'recording' || recorder.state === 'paused';

  return (
    <CaptureDialog title="Record a memory" onRequestClose={requestClose}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button
          variant="ghost"
          size="icon"
          onClick={requestClose}
          aria-label="Close"
          disabled={phase === 'saving' && !keptId}
        >
          <X className="size-5" />
        </Button>
        {phase === 'record' && <CollectionSelect value={collectionId} onChange={setCollectionId} />}
      </div>

      {phase === 'record' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-10">
          {recorder.state === 'error' ? (
            <div className="max-w-xs text-center">
              <Mic className="mx-auto mb-4 size-10 text-muted-foreground" />
              <p className="mb-6 text-sm text-muted-foreground">{recorder.error}</p>
              <Button onClick={() => recorder.start()}>Try again</Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {recorder.state === 'recording' && (
                    <span className="size-2 animate-recording-pulse rounded-full bg-destructive" />
                  )}
                  {recorder.state === 'requesting'
                    ? 'Allow microphone access…'
                    : recorder.state === 'paused'
                      ? 'Paused'
                      : 'Listening'}
                </div>
                <div className="font-serif text-6xl tabular-nums tracking-tight">
                  {formatDuration(recorder.elapsedMs)}
                </div>
              </div>

              <LevelMeter active={recorder.state === 'recording'} getLevel={recorder.getLevel} />

              <p className="max-w-xs text-center text-sm text-muted-foreground">
                {online ? (
                  'Take your time. It saves the moment you stop.'
                ) : (
                  <>
                    <CloudOff className="mr-1.5 inline size-3.5 align-[-2px]" />
                    You’re offline. It saves on this device and uploads when you’re back.
                  </>
                )}
              </p>

              <div className="flex items-center gap-6">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-14 rounded-full"
                  disabled={!isLive}
                  onClick={recorder.state === 'paused' ? recorder.resume : recorder.pause}
                  aria-label={recorder.state === 'paused' ? 'Resume' : 'Pause'}
                >
                  {recorder.state === 'paused' ? (
                    <Play className="size-5" />
                  ) : (
                    <Pause className="size-5" />
                  )}
                </Button>
                <Button
                  size="icon"
                  className="size-20 rounded-full [&_svg]:size-7"
                  disabled={!isLive}
                  onClick={stopAndSave}
                  aria-label="Stop and save"
                >
                  <Square className="fill-current" />
                </Button>
                <div className="size-14" />
              </div>
            </>
          )}
        </div>
      )}

      {phase === 'saving' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Uploading… {Math.round(progress * 100)}%</p>
          {keptId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={closeWhileUploading}
            >
              It’s safe on this device — close and let it finish
            </Button>
          )}
        </div>
      )}

      {phase === 'queued' && (
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4" />
            Saved on this device
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a title (optional)"
            className="h-12 border-0 px-0 font-serif text-2xl shadow-none focus-visible:ring-0 md:text-2xl"
            maxLength={200}
            autoFocus
          />
          <div className="flex gap-3 rounded-xl bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
            <CloudOff className="mt-0.5 size-4 shrink-0" />
            <span>
              {online
                ? 'Couldn’t reach Lore just now. It’ll upload by itself — you’ll see it under “Waiting to upload” on Home until it does.'
                : 'You’re offline. It’ll upload by itself when you’re back online, then the transcript fills in.'}
            </span>
          </div>
          <div className="mt-auto flex gap-2 sm:mt-2">
            <Button className="flex-1" onClick={() => finish(false)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <p className="font-medium">Couldn’t save your recording</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            {keptId
              ? `${sentence(failure ?? 'Lore said no')} It’s kept on this device — try again, or download it.`
              : 'It’s still here. Check your connection and try again, or download it so it’s safe.'}
          </p>
          <div className="flex gap-2">
            <Button onClick={save}>
              <RotateCcw /> Try again
            </Button>
            <Button variant="outline" onClick={downloadRecording}>
              <Download /> Download
            </Button>
          </div>
        </div>
      )}

      {phase === 'saved' && (
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="size-4" />
            Saved to {saved?.collections[0]?.name ?? 'Our family'}
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a title (optional)"
            className="h-12 border-0 px-0 font-serif text-2xl shadow-none focus-visible:ring-0 md:text-2xl"
            maxLength={200}
            autoFocus
          />
          <div className="min-h-24 rounded-xl bg-muted/60 p-4 font-serif text-[1.05rem] leading-relaxed">
            {!audio || audio.transcriptStatus === 'pending' ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Writing down what you said…
              </span>
            ) : audio.transcriptStatus === 'done' ? (
              audio.text || <span className="text-muted-foreground">No words detected.</span>
            ) : audio.transcriptStatus === 'failed' ? (
              <span className="text-muted-foreground">
                Couldn’t transcribe this one. Your recording is saved — you can retry from the
                memory.
              </span>
            ) : (
              <span className="text-muted-foreground">
                Your recording is saved. Transcription isn’t set up on this server.
              </span>
            )}
          </div>
          <div className="mt-auto flex gap-2 sm:mt-2">
            <Button variant="outline" className="flex-1" onClick={() => finish(true)}>
              Open memory
            </Button>
            <Button className="flex-1" onClick={() => finish(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </CaptureDialog>
  );
}

/** "Can't upload that" → "Can't upload that." */
function sentence(text: string) {
  return /[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

const WAVEFORM_BARS = 24;
const WAVEFORM_STEP_PX = 10; // w-1.5 (6px) + gap-1 (4px)
const WAVEFORM_STEP_MS = 50; // ~1.2s visible window across 24 bars
const MIN_BAR_PX = 6;
const MAX_BAR_PX = 64;
const WAVEFORM_MASK = 'linear-gradient(to right, transparent, black 12%, black 97%, transparent)';

interface LevelMeterProps {
  active: boolean;
  getLevel: () => number;
}

/** Live scrolling voice waveform driven outside React state so 60fps updates stay crisp. */
function LevelMeter({ active, getLevel }: LevelMeterProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const levelsRef = useRef<number[]>(Array(WAVEFORM_BARS + 1).fill(0));
  const envelopeRef = useRef(0);
  const scrollPxRef = useRef(0);

  useEffect(() => {
    const syncDom = () => {
      const levels = levelsRef.current;
      for (let i = 0; i < levels.length; i++) {
        const bar = barRefs.current[i];
        if (!bar) continue;
        const height = MIN_BAR_PX + levels[i] * (MAX_BAR_PX - MIN_BAR_PX);
        bar.style.height = `${height.toFixed(1)}px`;
      }
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(${-scrollPxRef.current}px, 0, 0)`;
      }
    };

    if (!active && envelopeRef.current === 0 && levelsRef.current.every((v) => v === 0)) {
      syncDom();
      return;
    }

    let frameId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(Math.max(now - lastTime, 0), 100);
      lastTime = now;

      const levels = levelsRef.current;
      const headIdx = WAVEFORM_BARS;

      if (active) {
        const instant = getLevel();
        // Fast attack so syllables pop immediately; smooth release for natural tails.
        const tau = instant > envelopeRef.current ? 12 : 65;
        const alpha = 1 - Math.exp(-dt / tau);
        envelopeRef.current += (instant - envelopeRef.current) * alpha;

        levels[headIdx] = Math.max(levels[headIdx], envelopeRef.current);

        scrollPxRef.current += (dt / WAVEFORM_STEP_MS) * WAVEFORM_STEP_PX;
        while (scrollPxRef.current >= WAVEFORM_STEP_PX) {
          scrollPxRef.current -= WAVEFORM_STEP_PX;
          for (let i = 0; i < headIdx; i++) {
            levels[i] = levels[i + 1];
          }
          levels[headIdx] = envelopeRef.current;
        }
        syncDom();
        frameId = requestAnimationFrame(frame);
        return;
      }

      // Smoothly settle bars back to quiet dots when paused or stopped.
      const decay = Math.exp(-dt / 60);
      envelopeRef.current *= decay;
      let anyVisible = envelopeRef.current > 0.005;
      for (let i = 0; i < levels.length; i++) {
        levels[i] *= decay;
        if (levels[i] > 0.005) anyVisible = true;
        else levels[i] = 0;
      }
      syncDom();
      if (anyVisible) {
        frameId = requestAnimationFrame(frame);
      } else {
        envelopeRef.current = 0;
      }
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [active, getLevel]);

  return (
    <div
      className="flex h-16 w-[242px] items-center overflow-hidden"
      style={{ maskImage: WAVEFORM_MASK, WebkitMaskImage: WAVEFORM_MASK }}
      aria-hidden
    >
      <div ref={trackRef} className="flex h-full items-center gap-1 will-change-transform">
        {Array.from({ length: WAVEFORM_BARS + 1 }, (_, i) => (
          <span
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className="w-1.5 shrink-0 rounded-full bg-foreground/80"
            style={{ height: `${MIN_BAR_PX}px` }}
          />
        ))}
      </div>
    </div>
  );
}
