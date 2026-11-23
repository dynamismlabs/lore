/**
 * Speech-to-text for voice memories. Runs synchronously against the stored
 * audio object — never against a URL a client supplied.
 *
 * 1. Groq Whisper (`GROQ_API_KEY`) — fast and accurate; recommended.
 * 2. Cloudflare Workers AI Whisper (`AI` binding) — no key needed on Cloudflare.
 * 3. Neither → the audio is kept and the transcript is marked unavailable.
 */
import { getEnvVar, tryGetCloudflareEnv } from '@/lib/server/cloudflare';
import type { TranscriptSegment } from '@/db/constants';

const GROQ_MODEL = 'whisper-large-v3-turbo';
const WORKERS_AI_MODEL = '@cf/openai/whisper-large-v3-turbo';
// Groq's free tier accepts up to 25 MB per request.
const GROQ_MAX_BYTES = 25 * 1024 * 1024;
// Workers AI takes base64 in a JSON body; keep requests modest.
const WORKERS_AI_MAX_BYTES = 15 * 1024 * 1024;

export type TranscriptionProvider = 'groq' | 'workers-ai';

export function getTranscriptionProvider(): TranscriptionProvider | null {
  if (getEnvVar('GROQ_API_KEY')) return 'groq';
  if (tryGetCloudflareEnv()?.AI) return 'workers-ai';
  return null;
}

export class TranscriptionError extends Error {}

export interface Transcript {
  text: string;
  /** When each line was said; empty if the provider didn't say. */
  segments: TranscriptSegment[];
}

export async function transcribeAudio(audio: {
  bytes: ArrayBuffer;
  contentType: string;
}): Promise<Transcript> {
  const provider = getTranscriptionProvider();
  if (provider === 'groq') return transcribeWithGroq(audio);
  if (provider === 'workers-ai') return transcribeWithWorkersAi(audio);
  throw new TranscriptionError('Transcription is not configured');
}

function extensionFor(contentType: string) {
  const type = contentType.split(';')[0].trim();
  if (type === 'audio/webm' || type === 'video/webm') return 'webm';
  if (type === 'audio/mp4' || type === 'audio/x-m4a' || type === 'video/mp4') return 'm4a';
  if (type === 'audio/mpeg') return 'mp3';
  if (type === 'audio/ogg') return 'ogg';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'wav';
  return 'webm';
}

async function transcribeWithGroq({
  bytes,
  contentType,
}: {
  bytes: ArrayBuffer;
  contentType: string;
}) {
  if (bytes.byteLength > GROQ_MAX_BYTES) {
    throw new TranscriptionError('Recording is too long to transcribe');
  }
  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: contentType.split(';')[0] }),
    `recording.${extensionFor(contentType)}`,
  );
  form.append('model', GROQ_MODEL);
  form.append('response_format', 'verbose_json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getEnvVar('GROQ_API_KEY')}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new TranscriptionError(
      `Groq transcription failed (${res.status}) ${detail.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { text?: string; segments?: WhisperSegment[] };
  return { text: (json.text ?? '').trim(), segments: toSegments(json.segments) };
}

async function transcribeWithWorkersAi({ bytes }: { bytes: ArrayBuffer; contentType: string }) {
  const ai = tryGetCloudflareEnv()?.AI;
  if (!ai) throw new TranscriptionError('Workers AI binding is missing');
  if (bytes.byteLength > WORKERS_AI_MAX_BYTES) {
    throw new TranscriptionError('Recording is too long to transcribe');
  }
  const result = await ai.run(WORKERS_AI_MODEL, { audio: toBase64(bytes) });
  return { text: (result.text ?? '').trim(), segments: toSegments(result.segments) };
}

/** Whisper segment, as both providers return it (times in seconds). */
interface WhisperSegment {
  start?: number;
  end?: number;
  text?: string;
}

export function toSegments(segments: WhisperSegment[] | undefined): TranscriptSegment[] {
  const result: TranscriptSegment[] = [];
  for (const segment of segments ?? []) {
    const text = segment.text?.trim();
    if (!text || typeof segment.start !== 'number' || typeof segment.end !== 'number') continue;
    const startMs = Math.max(0, Math.round(segment.start * 1000));
    result.push({ startMs, endMs: Math.max(startMs, Math.round(segment.end * 1000)), text });
  }
  return result;
}

function toBase64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}
