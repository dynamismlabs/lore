/**
 * Microphone recording with pause/resume, elapsed time and a live input level
 * (so people can see it's actually hearing them).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pickAudioMimeType } from '@/lib/client/media';

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped' | 'error';

export interface UseRecorderOptions {
  /** Create an AudioContext analyser so callers can poll live input levels via getLevel(). */
  meter?: boolean;
}

const MAX_RECORDING_MS = 60 * 60 * 1000;
// Calibrated for conversational speech in dBFS; wide enough that a loud cough
// does not make normal speaking afterward look flat.
const MIN_LEVEL_DB = -50;
const MAX_LEVEL_DB = -12;

/** Convert time-domain samples (float [-1, 1] or 8-bit [0, 255] with zero=128, scale=128) to 0..1 loudness. */
export function computeAudioLevel(samples: ArrayLike<number>, zero = 0, scale = 1): number {
  const count = samples.length;
  if (count === 0) return 0;

  // Strip DC offset so a biased microphone never lifts the silence floor.
  let mean = 0;
  for (let i = 0; i < count; i++) mean += (samples[i] - zero) / scale;
  mean /= count;

  let sumSq = 0;
  for (let i = 0; i < count; i++) {
    const centered = (samples[i] - zero) / scale - mean;
    sumSq += centered * centered;
  }

  const rms = Math.sqrt(sumSq / count);
  if (rms < 1e-6) return 0;

  const db = 20 * Math.log10(rms);
  const normalized = Math.max(0, Math.min(1, (db - MIN_LEVEL_DB) / (MAX_LEVEL_DB - MIN_LEVEL_DB)));
  return Math.pow(normalized, 0.85);
}

export function useRecorder({ meter = true }: UseRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const floatBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const byteBufferRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const sessionRef = useRef(0);
  const resolveStopRef = useRef<((blob: { blob: Blob; durationMs: number }) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    analyserRef.current = null;
    floatBufferRef.current = null;
    byteBufferRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      recorderRef.current = null;
      cleanup();
    };
  }, [cleanup]);

  const currentElapsed = () =>
    accumulatedRef.current +
    (recorderRef.current?.state === 'recording' ? Date.now() - startedAtRef.current : 0);

  const getLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser || recorderRef.current?.state !== 'recording') return 0;

    const floatBuf = floatBufferRef.current;
    if (floatBuf && typeof analyser.getFloatTimeDomainData === 'function') {
      analyser.getFloatTimeDomainData(floatBuf);
      return computeAudioLevel(floatBuf);
    }

    const byteBuf = byteBufferRef.current;
    if (byteBuf) {
      analyser.getByteTimeDomainData(byteBuf);
      return computeAudioLevel(byteBuf, 128, 128);
    }

    return 0;
  }, []);

  const start = useCallback(async () => {
    cleanup();
    const session = ++sessionRef.current;
    setError(null);
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('error');
      setError('This browser can’t record audio.');
      return;
    }
    setState('requesting');
    try {
      // Disable echoCancellation and autoGainControl: there is no call far-end audio
      // to cancel, and browser AGC aggressively ducks mic gain after a loud cough.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false },
      });
      if (sessionRef.current !== session) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const durationMs = accumulatedRef.current;
        cleanup();
        setState('stopped');
        resolveStopRef.current?.({ blob, durationMs });
        resolveStopRef.current = null;
      };
      recorderRef.current = recorder;

      if (meter) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioContext = new AudioCtx();
        audioContextRef.current = audioContext;
        if (audioContext.state === 'suspended') {
          void audioContext.resume().catch(() => {});
        }
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        const source = audioContext.createMediaStreamSource(stream);
        // Connect through a zero-gain node to destination so WebKit/Safari reliably pulls audio frames.
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(analyser);
        analyser.connect(silentGain);
        silentGain.connect(audioContext.destination);

        analyserRef.current = analyser;
        floatBufferRef.current = new Float32Array(analyser.fftSize);
        byteBufferRef.current = new Uint8Array(analyser.fftSize);
      }

      accumulatedRef.current = 0;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => {
        const elapsed = currentElapsed();
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS && recorderRef.current?.state === 'recording') {
          recorderRef.current.stop();
        }
      }, 200);
      recorder.start(1000);
      setState('recording');
    } catch (err) {
      if (sessionRef.current !== session) return;
      cleanup();
      setState('error');
      const name = (err as DOMException)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'Microphone access is blocked. Allow it in your browser settings and try again.'
          : name === 'NotFoundError'
            ? 'No microphone found.'
            : 'Couldn’t start recording.',
      );
    }
  }, [cleanup, meter]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'recording') return;
    accumulatedRef.current += Date.now() - startedAtRef.current;
    recorder.pause();
    audioContextRef.current?.suspend().catch(() => {});
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== 'paused') return;
    startedAtRef.current = Date.now();
    recorder.resume();
    audioContextRef.current?.resume().catch(() => {});
    setState('recording');
  }, []);

  /** Stop and get the recording. */
  const stop = useCallback(() => {
    return new Promise<{ blob: Blob; durationMs: number }>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') return;
      if (recorder.state === 'recording')
        accumulatedRef.current += Date.now() - startedAtRef.current;
      setElapsedMs(accumulatedRef.current);
      resolveStopRef.current = resolve;
      recorder.stop();
    });
  }, []);

  /** Throw the recording away. */
  const discard = useCallback(() => {
    sessionRef.current += 1;
    const recorder = recorderRef.current;
    resolveStopRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    recorderRef.current = null;
    chunksRef.current = [];
    cleanup();
    setElapsedMs(0);
    setState('idle');
  }, [cleanup]);

  return { state, error, elapsedMs, getLevel, start, pause, resume, stop, discard };
}
