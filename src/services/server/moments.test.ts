import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPrompt, findMoments, parseMoments, transcriptLines } from './moments';
import { toSegments } from './transcription';

const input = {
  transcript: 'We drove to the hospital in the snow. She walked across the kitchen. The end.',
  segments: [
    { startMs: 1_000, endMs: 60_000, text: 'We drove to the hospital in the snow.' },
    { startMs: 61_000, endMs: 90_000, text: 'She walked across the kitchen.' },
    { startMs: 91_000, endMs: 95_000, text: 'The end.' },
  ],
  recordedAt: new Date('2026-11-20T20:00:00Z'),
  people: [{ id: 'p-ella', name: 'Ella', relationship: 'daughter', birthDate: '2019-03-03' }],
};
const lines = transcriptLines(input);

const answer = (moments: unknown[]) => JSON.stringify({ moments });

describe('finding moments', () => {
  it('gives the model numbered lines, the recording date and who’s who', () => {
    const prompt = buildPrompt(input, lines);
    expect(prompt).toContain('Recorded on: 2026-11-20 (Friday)');
    expect(prompt).toContain('- id: p-ella · Ella · daughter · born 2019-03-03');
    expect(prompt).toContain('[2] She walked across the kitchen.');
  });

  it('splits an untimed (typed) transcript into sentences', () => {
    expect(transcriptLines({ transcript: input.transcript, segments: [] })).toEqual([
      { text: 'We drove to the hospital in the snow.', startMs: null, endMs: null },
      { text: 'She walked across the kitchen.', startMs: null, endMs: null },
      { text: 'The end.', startMs: null, endMs: null },
    ]);
  });

  it('turns line numbers into audio times, dates into precision, and names into people', () => {
    const content = `Here you go:\n\`\`\`json\n${answer([
      {
        title: 'First steps',
        summary: 'She walked across the kitchen.',
        date: '2020-06',
        personIds: ['p-ella', 'p-unknown'],
        otherNames: ['ella', 'Grandpa Joe', ' '],
        startLine: 2,
        endLine: 3,
      },
    ])}\n\`\`\``;
    expect(parseMoments(content, input, lines)).toEqual([
      {
        title: 'First steps',
        summary: 'She walked across the kitchen.',
        occurredAt: new Date('2020-06-01T12:00:00Z'),
        precision: 'month',
        startMs: 61_000,
        endMs: 95_000,
        people: [
          { id: 'p-ella', name: 'Ella' },
          { id: null, name: 'Grandpa Joe' },
        ],
      },
    ]);
  });

  it('drops moments it can’t date, dates in the future, and lines that don’t exist', () => {
    const moments = parseMoments(
      answer([
        {
          title: 'Undated',
          summary: 'Something.',
          date: 'a while ago',
          personIds: [],
          otherNames: [],
          startLine: 1,
          endLine: 1,
        },
        {
          title: 'Future',
          summary: 'Next year.',
          date: '2027',
          personIds: [],
          otherNames: [],
          startLine: 1,
          endLine: 1,
        },
        {
          title: 'Lost',
          summary: 'Born.',
          date: '2019-03-03',
          personIds: [],
          otherNames: [],
          startLine: 40,
          endLine: 41,
        },
      ]),
      input,
      lines,
    );
    expect(moments).toEqual([
      expect.objectContaining({ title: 'Lost', precision: 'day', startMs: null, endMs: null }),
    ]);
  });

  it('refuses an answer that isn’t the JSON it asked for', () => {
    expect(() => parseMoments('Sorry, I can’t help with that.', input, lines)).toThrow(
      /Couldn’t read/,
    );
  });

  describe('with Groq', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it('asks for JSON and reads the reply', async () => {
      vi.stubEnv('GROQ_API_KEY', 'test-key');
      const fetch = vi.fn(async () =>
        Response.json({
          choices: [
            {
              message: {
                content: answer([
                  {
                    title: 'Born',
                    summary: 'Snow.',
                    date: '2019-03-03',
                    personIds: ['p-ella'],
                    otherNames: [],
                    startLine: 1,
                    endLine: 1,
                  },
                ]),
              },
            },
          ],
        }),
      );
      vi.stubGlobal('fetch', fetch);

      const moments = await findMoments(input);
      expect(moments).toEqual([
        expect.objectContaining({ title: 'Born', startMs: 1_000, endMs: 60_000 }),
      ]);
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(JSON.parse(init.body as string)).toMatchObject({
        model: 'openai/gpt-oss-120b',
        response_format: { type: 'json_schema' },
      });
    });
  });
});

describe('transcript segments', () => {
  it('keeps timed lines in milliseconds and skips empty ones', () => {
    expect(
      toSegments([
        { start: 0, end: 2.5, text: ' Hello. ' },
        { start: 2.5, end: 3, text: '  ' },
        { text: 'No times' },
        { start: 4, end: 3.9, text: 'Backwards' },
      ]),
    ).toEqual([
      { startMs: 0, endMs: 2_500, text: 'Hello.' },
      { startMs: 4_000, endMs: 4_000, text: 'Backwards' },
    ]);
    expect(toSegments(undefined)).toEqual([]);
  });
});
