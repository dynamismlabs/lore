/**
 * Short video clips in the browser, for vibes: record from the camera until
 * you stop (or the limit), or cut a part out of a video you already took
 * (re-recorded from a canvas, so no ffmpeg is needed).
 */
/** A vibe is at least this long… */
export const MIN_CLIP_MS = 1000;
/** …and stops by itself here. */
export const MAX_CLIP_MS = 10_000;

/** MP4/H.264 plays everywhere (Safari included); fall back to WebM. */
export function pickVideoMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

function baseType(mimeType: string | undefined, fallback: string) {
  return (mimeType ?? fallback).split(';')[0];
}

export interface Clip {
  blob: Blob;
  durationMs: number;
}

export interface Recording {
  /** Stop now, or once the clip reaches the minimum length. */
  stop: () => void;
  /** Stop and throw the clip away (`done` rejects). */
  cancel: () => void;
  done: Promise<Clip>;
}

/** Record a live stream until `stop()`, or until `maxMs`. */
export function startRecording(
  stream: MediaStream,
  { minMs = MIN_CLIP_MS, maxMs = MAX_CLIP_MS }: { minMs?: number; maxMs?: number } = {},
): Recording {
  const mimeType = pickVideoMimeType();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;
  const halt = () => {
    timers.forEach(clearTimeout);
    if (recorder.state !== 'inactive') recorder.stop();
  };
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const startedAt = performance.now();
  const done = new Promise<Clip>((resolve, reject) => {
    recorder.onstop = () => {
      if (cancelled) return reject(new Error('Recording cancelled'));
      resolve({
        blob: new Blob(chunks, { type: baseType(recorder.mimeType || mimeType, 'video/webm') }),
        durationMs: Math.round(Math.min(maxMs, performance.now() - startedAt)),
      });
    };
    recorder.onerror = () => reject(new Error('Recording failed'));
  });
  recorder.start();
  timers.push(setTimeout(halt, maxMs));
  return {
    stop: () => {
      const wait = minMs - (performance.now() - startedAt);
      if (wait > 0) timers.push(setTimeout(halt, wait));
      else halt();
    },
    cancel: () => {
      cancelled = true;
      halt();
    },
    done,
  };
}

function once(target: EventTarget, event: string) {
  return new Promise<void>((resolve, reject) => {
    target.addEventListener(event, () => resolve(), { once: true });
    target.addEventListener('error', () => reject(new Error(`Video ${event} failed`)), {
      once: true,
    });
  });
}

/** Load a video file and report its length (seconds). */
export async function loadVideo(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.playsInline = true;
  video.src = url;
  await once(video, 'loadedmetadata');
  return { url, duration: Number.isFinite(video.duration) ? video.duration : 0 };
}

/**
 * Cut `lengthMs` starting at `startSec` out of a video file by playing it into
 * a canvas (and its audio into a stream) and recording that. Takes as long as
 * the part being cut.
 */
export async function extractClip(
  fileUrl: string,
  startSec: number,
  lengthMs: number,
): Promise<Clip> {
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.src = fileUrl;
  await once(video, 'loadedmetadata');

  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale) || 720;
  canvas.height = Math.round(video.videoHeight * scale) || 1280;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(30);

  let audio: AudioContext | null = null;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio = new AudioCtx();
    const destination = audio.createMediaStreamDestination();
    // Routed only into the recording, so nothing plays out loud.
    audio.createMediaElementSource(video).connect(destination);
    destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch {
    video.muted = true; // silent clip rather than no clip
  }

  video.currentTime = startSec;
  await once(video, 'seeked');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  let drawing = true;
  const draw = () => {
    if (!drawing) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
  };
  const recording = startRecording(stream, { minMs: 0, maxMs: lengthMs });
  recording.done.catch(() => {}); // awaited below; this only quiets the cancel in `finally`
  video.addEventListener('ended', recording.stop, { once: true });
  try {
    await video.play();
    draw();
    return await recording.done;
  } finally {
    recording.cancel(); // no-op once it has finished
    drawing = false;
    video.pause();
    stream.getTracks().forEach((t) => t.stop());
    await audio?.close().catch(() => {});
  }
}
