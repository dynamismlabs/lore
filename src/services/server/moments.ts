/**
 * Finds the separate moments in a long recording ("the night she was born",
 * "our first apartment") with roughly when each happened, who was in it, and
 * where it is in the audio. Nothing reaches the timeline until the author
 * adds it.
 *
 * Uses the same providers as transcription:
 * 1. Groq (`GROQ_API_KEY`).
 * 2. Cloudflare Workers AI (`AI` binding) — no key needed on Cloudflare.
 */
import { z } from 'zod';
import { parseApproximateDate } from '@/lib/dates';
import { getEnvVar, tryGetCloudflareEnv } from '@/lib/server/cloudflare';
import type { DatePrecision, SuggestedPerson, TranscriptSegment } from '@/db/constants';

const GROQ_MODEL = 'openai/gpt-oss-120b';
const WORKERS_AI_MODEL = '@cf/openai/gpt-oss-120b';
const MAX_OUTPUT_TOKENS = 16_000;
/** About two hours of talking. */
const MAX_TRANSCRIPT_CHARS = 150_000;
const MAX_MOMENTS = 30;

export type MomentsProvider = 'groq' | 'workers-ai';

export function getMomentsProvider(): MomentsProvider | null {
  if (getEnvVar('GROQ_API_KEY')) return 'groq';
  if (tryGetCloudflareEnv()?.AI) return 'workers-ai';
  return null;
}

export class MomentsError extends Error {}

export interface MomentPerson {
  id: string;
  name: string;
  relationship: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
}

export interface MomentsInput {
  transcript: string;
  segments: TranscriptSegment[];
  /** When the recording was made, for "last summer" and "two years ago". */
  recordedAt: Date;
  people: MomentPerson[];
}

export interface FoundMoment {
  title: string | null;
  summary: string;
  occurredAt: Date;
  precision: DatePrecision;
  startMs: number | null;
  endMs: number | null;
  people: SuggestedPerson[];
}

export async function findMoments(input: MomentsInput): Promise<FoundMoment[]> {
  const lines = transcriptLines(input);
  if (!lines.length) return [];
  if (lines.reduce((total, line) => total + line.text.length, 0) > MAX_TRANSCRIPT_CHARS) {
    throw new MomentsError('This recording is too long to look through');
  }
  const content = await complete([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildPrompt(input, lines) },
  ]);
  return parseMoments(content, input, lines);
}

const SYSTEM_PROMPT = `You help a family keep their memories. You get the transcript of a recording where people talk about their past, often covering many separate events across months or years. Find the distinct moments that would each make a good memory on a family timeline.

For each moment:
- title: a short, warm title of at most 8 words, like a photo album caption.
- summary: 1 to 4 sentences retelling the moment in the speakers' own voice ("we", "I"), using only what they said. No commentary or embellishment.
- date: when it happened (not when it was recorded), as precisely as the conversation supports: "YYYY-MM-DD", "YYYY-MM" or "YYYY". Relative phrases ("last summer", "two years ago") count back from the recording date. Ages ("when she was three") count forward from that person's birth date when it's listed. If you can't place a moment even to a year, leave it out.
- personIds: ids from the people list for everyone the moment is about or who was there.
- otherNames: first names of other people in the moment who aren't in the list. No pronouns or roles like "the doctor".
- startLine and endLine: the first and last transcript line numbers where the moment is told.

Skip small talk, opinions and anything that isn't a specific event. Don't split one event into several moments or merge separate events. If the whole recording is about one event, return just that one. Return at most ${MAX_MOMENTS} moments, in the order they're told. Reply with JSON only, shaped like {"moments": [...]}.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['moments'],
  properties: {
    moments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'date', 'personIds', 'otherNames', 'startLine', 'endLine'],
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD, YYYY-MM or YYYY' },
          personIds: { type: 'array', items: { type: 'string' } },
          otherNames: { type: 'array', items: { type: 'string' } },
          startLine: { type: 'integer' },
          endLine: { type: 'integer' },
        },
      },
    },
  },
} as const;

interface Line {
  text: string;
  startMs: number | null;
  endMs: number | null;
}

/** Timed Whisper lines when we have them; otherwise the transcript split into sentences. */
export function transcriptLines({
  transcript,
  segments,
}: Pick<MomentsInput, 'transcript' | 'segments'>): Line[] {
  if (segments.length) {
    return segments.map((s) => ({ text: s.text, startMs: s.startMs, endMs: s.endMs }));
  }
  return transcript
    .split(/\n+|(?<=[.!?])\s+/)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({ text, startMs: null, endMs: null }));
}

export function buildPrompt({ recordedAt, people }: MomentsInput, lines: Line[]) {
  const day = recordedAt.toISOString().slice(0, 10);
  const weekday = recordedAt.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const peopleList = people.length
    ? people
        .map((p) =>
          [`- id: ${p.id}`, p.name, p.relationship, p.birthDate && `born ${p.birthDate}`]
            .filter(Boolean)
            .join(' · '),
        )
        .join('\n')
    : '(none yet)';
  const transcript = lines.map((line, i) => `[${i + 1}] ${line.text}`).join('\n');
  return `Recorded on: ${day} (${weekday})\n\nPeople:\n${peopleList}\n\nTranscript:\n${transcript}`;
}

const responseSchema = z.object({
  moments: z.array(
    z.object({
      title: z.string().nullish(),
      summary: z.string(),
      date: z.string(),
      personIds: z.array(z.string()).nullish(),
      otherNames: z.array(z.string()).nullish(),
      startLine: z.number().int().nullish(),
      endLine: z.number().int().nullish(),
    }),
  ),
});

/** Check the model's answer against what we gave it; drop anything that doesn't hold up. */
export function parseMoments(content: string, input: MomentsInput, lines: Line[]): FoundMoment[] {
  const parsed = responseSchema.safeParse(extractJson(content));
  if (!parsed.success) throw new MomentsError('Couldn’t read the moments that came back');

  const byId = new Map(input.people.map((p) => [p.id, p]));
  const byName = new Map(input.people.map((p) => [p.name.trim().toLowerCase(), p]));
  const latest = input.recordedAt.getTime() + 86_400_000;
  const moments: FoundMoment[] = [];

  for (const moment of parsed.data.moments.slice(0, MAX_MOMENTS)) {
    const summary = moment.summary.trim().slice(0, 5_000);
    const when = parseApproximateDate(moment.date);
    if (!summary || !when) continue;
    if (when.date.getTime() > latest || when.date.getUTCFullYear() < 1900) continue;

    const people = new Map<string, SuggestedPerson>();
    for (const id of moment.personIds ?? []) {
      const person = byId.get(id);
      if (person) people.set(person.id, { id: person.id, name: person.name });
    }
    for (const raw of moment.otherNames ?? []) {
      const name = raw.trim().slice(0, 80);
      if (!name) continue;
      const known = byName.get(name.toLowerCase());
      if (known) people.set(known.id, { id: known.id, name: known.name });
      else if (![...people.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        people.set(`new:${name.toLowerCase()}`, { id: null, name });
      }
    }

    let startMs: number | null = null;
    let endMs: number | null = null;
    if (moment.startLine && moment.endLine) {
      const first = lines[Math.min(moment.startLine, moment.endLine) - 1];
      const last = lines[Math.max(moment.startLine, moment.endLine) - 1];
      if (first?.startMs != null && last?.endMs != null && last.endMs > first.startMs) {
        startMs = first.startMs;
        endMs = last.endMs;
      }
    }

    moments.push({
      title: moment.title?.trim().slice(0, 200) || null,
      summary,
      occurredAt: when.date,
      precision: when.precision,
      startMs,
      endMs,
      people: [...people.values()],
    });
  }
  return moments;
}

function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

type Message = { role: 'system' | 'user'; content: string };

const responseFormat = {
  type: 'json_schema' as const,
  json_schema: { name: 'moments', schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> },
};

async function complete(messages: Message[]): Promise<string> {
  const provider = getMomentsProvider();
  if (provider === 'groq') return completeWithGroq(messages);
  if (provider === 'workers-ai') return completeWithWorkersAi(messages);
  throw new MomentsError('Finding moments is not set up');
}

async function completeWithGroq(messages: Message[]) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getEnvVar('GROQ_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      response_format: responseFormat,
      reasoning_effort: 'medium',
      max_completion_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new MomentsError(`Groq request failed (${res.status}) ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  return json.choices?.[0]?.message?.content ?? '';
}

async function completeWithWorkersAi(messages: Message[]) {
  const ai = tryGetCloudflareEnv()?.AI;
  if (!ai) throw new MomentsError('Workers AI binding is missing');
  const result = await ai.run(WORKERS_AI_MODEL, {
    messages,
    response_format: responseFormat,
    reasoning_effort: 'medium',
    max_tokens: MAX_OUTPUT_TOKENS,
  });
  if ('choices' in result && result.choices) {
    const content = result.choices[0]?.message?.content;
    return typeof content === 'string' ? content : '';
  }
  return 'output_text' in result ? (result.output_text ?? '') : '';
}
