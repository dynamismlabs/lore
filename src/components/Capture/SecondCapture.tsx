/**
 * Capture a vibe: a few seconds of video. Tap to start, tap to stop; it stops
 * by itself at MAX_CLIP_MS. Or pick a part of a video you already took.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, format, startOfDay } from 'date-fns';
import { Film, Loader2, RefreshCcw, RotateCcw, SwitchCamera, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveDefaultCollectionId } from '@/lib/client/device';
import { trpc } from '@/lib/client/trpc';
import {
  type Clip,
  MAX_CLIP_MS,
  MIN_CLIP_MS,
  type Recording,
  extractClip,
  loadVideo,
  startRecording,
} from '@/lib/client/video';
import { useOnline } from '@/hooks/useOnline';
import { useViewer } from '@/hooks/useViewer';
import CaptureDialog from '@/components/Capture/CaptureDialog';
import CollectionSelect from '@/components/Capture/CollectionSelect';
import { useOutbox } from '@/components/Outbox/OutboxProvider';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface Props {
  /** Defaults to today. Saving replaces any clip you already have for this day. */
  day?: Date;
  collectionId?: string;
  onClose: () => void;
}

type Phase = 'camera' | 'trim' | 'review' | 'saving';

const MAX_SECONDS = MAX_CLIP_MS / 1000;
const MIN_SECONDS = MIN_CLIP_MS / 1000;
const TRIM_STEP = 0.1;

const seconds = (s: number) => `${s.toFixed(1).replace(/\.0$/, '')}s`;

export default function SecondCapture({ day, collectionId: initialCollectionId, onClose }: Props) {
  const outbox = useOutbox();
  const online = useOnline();
  const { viewer } = useViewer();
  const [phase, setPhase] = useState<Phase>('camera');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [clip, setClip] = useState<(Clip & { url: string }) | null>(null);
  const [source, setSource] = useState<{ url: string; duration: number } | null>(null);
  /** The part of a picked video to keep, in seconds: [start, end]. */
  const [part, setPart] = useState<[number, number]>([0, MAX_SECONDS]);
  const movedEnd = useRef(false);
  const [collectionId, setCollectionId] = useState(
    () => initialCollectionId ?? resolveDefaultCollectionId(viewer?.id),
  );
  const streamRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const trimRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [when] = useState(() => day ?? new Date());
  const [range] = useState(() => {
    const from = startOfDay(when);
    return { from, to: addDays(from, 1) };
  });
  // Only for the button label: a retake says "Replace".
  const { data: mine } = trpc.stories.seconds.useQuery({ ...range, onlyMine: true });

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const acceptClip = (next: Clip) => {
    setClip({ ...next, url: URL.createObjectURL(next.blob) });
    setPhase('review');
  };

  /** First tap starts recording; the next one stops it. */
  const toggleRecording = async () => {
    if (recordingRef.current) {
      recordingRef.current.stop();
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;
    let current: Recording;
    try {
      current = startRecording(stream);
    } catch {
      toast.error('Couldn’t record — try again');
      return;
    }
    recordingRef.current = current;
    setRecording(true);
    try {
      acceptClip(await current.done);
    } catch {
      if (recordingRef.current === current) toast.error('Couldn’t record — try again');
    } finally {
      if (recordingRef.current === current) {
        recordingRef.current = null;
        setRecording(false);
      }
    }
  };

  // Throw away a recording in progress when the dialog goes away.
  useEffect(
    () => () => {
      const current = recordingRef.current;
      recordingRef.current = null;
      current?.cancel();
    },
    [],
  );

  // Camera on while choosing.
  useEffect(() => {
    if (phase !== 'camera') return;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        setCameraError(null);
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          liveRef.current.play().catch(() => {});
        }
      })
      .catch(() =>
        setCameraError('Camera access is blocked. You can still pick a video you took.'),
      );
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [phase, facing, stopCamera]);

  // Loop the chosen part while trimming. Moving the end shows the last moment.
  const [partStart, partEnd] = part;
  useEffect(() => {
    const video = trimRef.current;
    if (phase !== 'trim' || !video) return;
    video.currentTime = movedEnd.current ? Math.max(partStart, partEnd - 1.5) : partStart;
    video.play().catch(() => {});
    const loop = () => {
      if (video.currentTime >= partEnd || video.currentTime < partStart - 0.25) {
        video.currentTime = partStart;
      }
    };
    video.addEventListener('timeupdate', loop);
    return () => video.removeEventListener('timeupdate', loop);
  }, [phase, partStart, partEnd]);

  /** Keep the part between MIN and MAX long; the thumb you drag pulls the other. */
  const changePart = (value: number[]) => {
    const [start, end] = value;
    movedEnd.current = end !== partEnd;
    if (end - start <= MAX_SECONDS) setPart([start, end]);
    else if (movedEnd.current) setPart([end - MAX_SECONDS, end]);
    else setPart([start, start + MAX_SECONDS]);
  };

  const pickFile = async (file: File) => {
    try {
      const loaded = await loadVideo(file);
      if (loaded.duration <= MIN_SECONDS + 0.05) {
        // Already about the shortest a vibe can be: use as is.
        acceptClip({
          blob: file,
          durationMs: loaded.duration > 0 ? Math.round(loaded.duration * 1000) : MIN_CLIP_MS,
        });
        return;
      }
      setSource(loaded);
      movedEnd.current = false;
      setPart([0, Math.min(loaded.duration, MAX_SECONDS)]);
      setPhase('trim');
    } catch {
      toast.error('Couldn’t open that video');
    }
  };

  const cut = async () => {
    if (!source) return;
    setCutting(true);
    try {
      acceptClip(
        await extractClip(source.url, partStart, Math.round((partEnd - partStart) * 1000)),
      );
    } catch {
      toast.error('Couldn’t cut that part — try recording instead');
    } finally {
      setCutting(false);
    }
  };

  const save = async () => {
    if (!clip) return;
    setPhase('saving');
    try {
      // Kept on this device first. Once it's up, your other clip for the day goes.
      const result = await outbox.save({
        kind: 'vibe',
        format: 'second',
        collectionId,
        occurredAt: when.getTime(),
        media: [{ kind: 'video', blob: clip.blob, durationMs: clip.durationMs }],
        replaceDay: { from: range.from.getTime(), to: range.to.getTime() },
      });
      if (result.status === 'failed') {
        toast.error(`Couldn’t upload: ${result.error}`, {
          description: 'It’s kept on this device. Retry it from Home.',
        });
      } else if (result.status === 'queued') {
        toast.success('Vibe saved on this device', {
          description: online ? 'It’ll upload by itself.' : 'It’ll upload when you’re back online.',
        });
      } else {
        toast.success('Saved today’s vibe');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t save — try again');
      setPhase('review');
    }
  };

  const requestClose = () => {
    if (phase === 'saving') return;
    if (clip && !window.confirm('Discard this vibe?')) return;
    const current = recordingRef.current;
    recordingRef.current = null;
    current?.cancel();
    stopCamera();
    onClose();
  };

  return (
    <CaptureDialog title="Today’s vibe" onRequestClose={requestClose}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" aria-label="Close" onClick={requestClose}>
          <X className="size-5" />
        </Button>
        <div className="text-sm text-muted-foreground">{format(when, 'EEEE, MMM d')}</div>
        <div className="size-9" />
      </div>

      <div className="flex flex-1 flex-col items-center gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="relative aspect-[9/16] max-h-[60dvh] w-full max-w-sm overflow-hidden rounded-2xl bg-black sm:aspect-[3/4]">
          {phase === 'camera' && (
            <>
              <video
                ref={liveRef}
                muted
                playsInline
                className={`size-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`}
              />
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white/80">
                  {cameraError}
                </div>
              )}
              {/* Time left, not a clock: starts full and empties as you record. */}
              {recording && (
                <div
                  aria-hidden
                  className="absolute inset-x-3 top-3 h-1 overflow-hidden rounded-full bg-white/30 shadow-sm"
                >
                  <div
                    className="h-full origin-left animate-shrink rounded-full bg-white"
                    style={{ animationDuration: `${MAX_CLIP_MS}ms` }}
                  />
                </div>
              )}
            </>
          )}
          {phase === 'trim' && source && (
            <video
              ref={trimRef}
              src={source.url}
              playsInline
              muted
              className="size-full object-contain"
            />
          )}
          {(phase === 'review' || phase === 'saving') && clip && (
            <video src={clip.url} autoPlay loop playsInline className="size-full object-cover" />
          )}
        </div>

        {phase === 'camera' && (
          <div className="flex w-full max-w-sm flex-col items-center gap-2">
            <div className="flex w-full items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                className="size-12"
                aria-label="Pick a video"
                disabled={recording}
                onClick={() => fileRef.current?.click()}
              >
                <Film className="size-5" />
              </Button>
              <button
                type="button"
                onClick={toggleRecording}
                disabled={!!cameraError}
                aria-label={recording ? 'Stop recording' : 'Start recording'}
                className="flex size-20 items-center justify-center rounded-full border-4 border-foreground/80 disabled:opacity-40"
              >
                <span
                  className={`rounded-full bg-destructive transition-all ${recording ? 'size-8 rounded-md' : 'size-14'}`}
                />
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-12"
                aria-label="Switch camera"
                disabled={recording}
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              >
                <SwitchCamera className="size-5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {recording ? 'Tap to stop' : `Tap to record · up to ${MAX_SECONDS} seconds`}
            </p>
          </div>
        )}

        {phase === 'trim' && source && (
          <div className="flex w-full max-w-sm flex-col gap-3">
            <p className="text-center text-sm text-muted-foreground">
              Pick up to {MAX_SECONDS} seconds ·{' '}
              <span className="tabular-nums text-foreground">{seconds(partEnd - partStart)}</span>
            </p>
            <Slider
              min={0}
              max={source.duration}
              step={TRIM_STEP}
              minStepsBetweenThumbs={Math.round(MIN_SECONDS / TRIM_STEP)}
              value={part}
              onValueChange={changePart}
              disabled={cutting}
              thumbLabels={['Start', 'End']}
              className="py-2"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={cutting}
                onClick={() => {
                  setSource(null);
                  setPhase('camera');
                }}
              >
                Back
              </Button>
              <Button className="flex-1" onClick={cut} disabled={cutting}>
                {cutting && <Loader2 className="animate-spin" />}
                {cutting ? 'Preparing…' : 'Use this part'}
              </Button>
            </div>
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="flex w-full max-w-sm flex-col gap-3">
            <div className="flex justify-center">
              <CollectionSelect value={collectionId} onChange={setCollectionId} />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={phase === 'saving'}
                onClick={() => {
                  setClip(null);
                  setPhase(source ? 'trim' : 'camera');
                }}
              >
                {source ? <RefreshCcw /> : <RotateCcw />} Retake
              </Button>
              <Button className="flex-1" onClick={save} disabled={phase === 'saving'}>
                {phase === 'saving' && <Loader2 className="animate-spin" />}
                {mine?.length ? 'Replace' : 'Save'}
              </Button>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) pickFile(file);
          }}
        />
      </div>
    </CaptureDialog>
  );
}
