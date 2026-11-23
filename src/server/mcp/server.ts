/**
 * Lore as an MCP server (ChatGPT, Ri, Claude, …). Every tool runs through the
 * same tRPC procedures the app uses, so the same access rules apply: the
 * assistant sees exactly what the signed-in person can see, and nothing more.
 * No tool deletes anything.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { RouterOutputs } from '@/lib/client/trpc';
import { formatApproximateDate, parseApproximateDate } from '@/lib/dates';
import { registerLoreViews } from './views/tools';
import type { Context } from '@/server/trpc/context';
import { appRouter } from '@/server/trpc/root';

type Memory = RouterOutputs['stories']['byId'];
type Caller = ReturnType<typeof appRouter.createCaller>;

const INSTRUCTIONS = `Lore is the user's private family memory journal: voice notes (with transcripts), written entries and photos, organized into collections that can be shared with family.
- Use search_memories to find memories by words, names or topics; list_recent_memories for "what happened lately" or a collection/person's memories; get_memory for the full text and comments.
- Use save_memory when the user asks you to remember, save, journal or log something. Write it in their voice; don't add details they didn't give. It goes to their private Moments collection unless they name a collection.
- To let the user see memories themselves (photos, voice notes, clips), call show_memories with the ids you found or saved. open_lore opens Lore as an app; people usually open it themselves.
- Memories are personal. Quote them faithfully and don't invent details that aren't in them.`;

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

function excerpt(text: string | null | undefined, max: number) {
  if (!text) return null;
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function toSummary(memory: Memory, origin: string, textLimit: number) {
  const text = memory.media
    .filter((m) => m.kind === 'text')
    .map((m) => m.text)
    .join('\n\n');
  const transcript = memory.media
    .filter((m) => m.kind === 'audio')
    .map((m) => m.text)
    .filter(Boolean)
    .join('\n\n');
  return {
    id: memory.id,
    title: memory.title,
    // "2019" or "2019-06" when that's all that's known.
    date: formatApproximateDate(memory.occurredAt, memory.occurredPrecision),
    author: memory.isMine ? `${memory.author.name} (you)` : memory.author.name,
    collections: memory.collections.map((c) => c.name),
    people: memory.people.map((p) => p.name),
    text: excerpt(text, textLimit),
    transcript: excerpt(transcript, textLimit),
    voiceNotes: memory.media.filter((m) => m.kind === 'audio').length,
    photos: memory.media.filter((m) => m.kind === 'image').length,
    videos: memory.media.filter((m) => m.kind === 'video').length,
    hearts: memory.heartCount,
    comments: memory.commentCount,
    url: `${origin}/memories/${memory.id}`,
  };
}

type Summary = ReturnType<typeof toSummary>;

function formatSummary(m: Summary) {
  const lines = [`### ${m.title ?? excerpt(m.text ?? m.transcript, 60) ?? 'Untitled'} (${m.date})`];
  const meta = [`by ${m.author}`];
  if (m.collections.length) meta.push(`in ${m.collections.join(', ')}`);
  if (m.people.length) meta.push(`with ${m.people.join(', ')}`);
  lines.push(meta.join(' · '));
  if (m.text) lines.push(m.text);
  if (m.transcript) lines.push(`Voice note: “${m.transcript}”`);
  const media = [
    m.photos && `${m.photos} photo${m.photos === 1 ? '' : 's'}`,
    m.videos && `${m.videos} video${m.videos === 1 ? '' : 's'}`,
  ].filter(Boolean);
  if (media.length) lines.push(media.join(', '));
  lines.push(`id: ${m.id} · ${m.url}`);
  return lines.join('\n');
}

function listResult(memories: Summary[], empty: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: memories.length ? memories.map(formatSummary).join('\n\n') : empty,
      },
    ],
    structuredContent: { memories },
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof TRPCError || error instanceof Error ? error.message : 'Something went wrong';
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

/** Wrap a tool so expected failures come back as tool errors, not protocol errors. */
function safe<A>(
  fn: (
    args: A,
  ) => Promise<
    | ReturnType<typeof listResult>
    | { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown> }
  >,
) {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (error) {
      return errorResult(error);
    }
  };
}

function parseDate(value: string | undefined) {
  if (!value) return {};
  // "2019", "2019-06", or a bare day (that day, not midnight UTC sliding into yesterday).
  const approximate = parseApproximateDate(value);
  const date = approximate?.date ?? new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error(`Couldn’t understand the date “${value}”. Use YYYY-MM-DD, YYYY-MM or YYYY.`);
  if (date.getTime() > Date.now() + 86_400_000) throw new Error('That date is in the future.');
  return { occurredAt: date, occurredPrecision: approximate?.precision ?? ('day' as const) };
}

async function resolvePeople(caller: Caller, names: string[]) {
  if (!names.length) return [];
  const known = await caller.people.list();
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    let match = known.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      const created = await caller.people.create({ name });
      match = { ...created, storyCount: 0 };
      known.push(match);
    }
    ids.push(match.id);
  }
  return [...new Set(ids)];
}

export function createLoreMcpServer(ctx: Context & { viewer: NonNullable<Context['viewer']> }) {
  const caller = appRouter.createCaller(ctx);
  const origin = ctx.origin;
  const server = new McpServer(
    { name: 'lore', title: 'Lore', version: '1.0.0', websiteUrl: origin },
    { instructions: INSTRUCTIONS, capabilities: { tools: {}, resources: {} } },
  );

  server.registerTool(
    'search_memories',
    {
      title: 'Search memories',
      description:
        'Search the memories the user can see (their own and shared collections) by words in titles, written text and voice-note transcripts. Returns the best matches, newest first.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .describe('Words to look for, e.g. "first fish" or "Grandma"'),
        limit: z.number().int().min(1).max(25).optional().describe('Max results (default 10)'),
      },
      annotations: READ,
    },
    safe(async ({ query, limit }) => {
      const results = await caller.stories.search({ q: query });
      return listResult(
        results.slice(0, limit ?? 10).map((m) => toSummary(m, origin, 600)),
        `No memories match “${query}”.`,
      );
    }),
  );

  server.registerTool(
    'list_recent_memories',
    {
      title: 'Recent memories',
      description:
        'List memories, newest first. Optionally only one collection or one person (ids from list_collections / list_people). Use sort "occurred" to order by when things happened instead of when they were added.',
      inputSchema: {
        collection_id: z.string().max(64).optional(),
        person_id: z.string().max(64).optional(),
        sort: z.enum(['recent', 'occurred']).optional(),
        limit: z.number().int().min(1).max(25).optional().describe('Max results (default 10)'),
      },
      annotations: READ,
    },
    safe(async ({ collection_id, person_id, sort, limit }) => {
      const page = await caller.stories.list({
        collectionId: collection_id,
        personId: person_id,
        sort: sort ?? (collection_id || person_id ? 'occurred' : 'recent'),
        limit: limit ?? 10,
      });
      return listResult(
        page.items.map((m) => toSummary(m, origin, 400)),
        'No memories yet.',
      );
    }),
  );

  server.registerTool(
    'get_memory',
    {
      title: 'Get a memory',
      description:
        'Everything in one memory: full text, voice-note transcripts, people, collections and comments.',
      inputSchema: { memory_id: z.string().min(1).max(64) },
      annotations: READ,
    },
    safe(async ({ memory_id }) => {
      const memory = await caller.stories.byId({ id: memory_id });
      const comments = await caller.comments.list({ storyId: memory_id });
      const summary = toSummary(memory, origin, 100_000);
      const commentLines = comments.map(
        (c) => `- ${c.author.name} (${c.createdAt.toISOString().slice(0, 10)}): ${c.body}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              formatSummary(summary),
              commentLines.length ? `Comments:\n${commentLines.join('\n')}` : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        structuredContent: {
          memory: summary,
          comments: comments.map((c) => ({
            author: c.author.name,
            date: c.createdAt.toISOString(),
            text: c.body,
          })),
        },
      };
    }),
  );

  server.registerTool(
    'list_collections',
    {
      title: 'Collections',
      description:
        'The collections the user belongs to, with who is in each and whether they can add to it. "Personal" is private to the user.',
      annotations: READ,
    },
    safe(async () => {
      const collections = (await caller.collections.list()).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        private: c.isDefault,
        role: c.role,
        canAdd: c.role !== 'viewer',
        memories: c.storyCount,
        members: c.members.map((m) => m.name),
      }));
      return {
        content: [
          {
            type: 'text' as const,
            text: collections
              .map(
                (c) =>
                  `- ${c.name} (id: ${c.id}) — ${c.memories} memories · ${c.private ? 'only you' : c.members.join(', ')}${c.canAdd ? '' : ' · view only'}`,
              )
              .join('\n'),
          },
        ],
        structuredContent: { collections },
      };
    }),
  );

  server.registerTool(
    'list_people',
    {
      title: 'People',
      description:
        'People tagged in the memories the user can see, with how many memories each appears in.',
      annotations: READ,
    },
    safe(async () => {
      const people = (await caller.people.list()).map((p) => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        memories: p.storyCount,
      }));
      return {
        content: [
          {
            type: 'text' as const,
            text: people.length
              ? people
                  .map(
                    (p) =>
                      `- ${p.name}${p.relationship ? ` (${p.relationship})` : ''} — ${p.memories} memories · id: ${p.id}`,
                  )
                  .join('\n')
              : 'No people tagged yet.',
          },
        ],
        structuredContent: { people },
      };
    }),
  );

  server.registerTool(
    'save_memory',
    {
      title: 'Save a memory',
      description:
        'Save a new written memory for the user. Goes to their Personal collection unless collection_id is given (must be one they can add to). Text is Markdown.',
      inputSchema: {
        text: z.string().min(1).max(20_000).describe('The memory, in the user’s words'),
        title: z.string().max(200).optional(),
        date: z
          .string()
          .max(40)
          .optional()
          .describe(
            'When it happened: YYYY-MM-DD, or YYYY-MM / YYYY when only the month or year is known (default: today)',
          ),
        collection_id: z.string().max(64).optional(),
        people: z
          .array(z.string().max(80))
          .max(20)
          .optional()
          .describe('Names of people in this memory'),
      },
      annotations: WRITE,
    },
    safe(async ({ text, title, date, collection_id, people }) => {
      const personIds = await resolvePeople(caller, people ?? []);
      const memory = await caller.stories.create({
        collectionId: collection_id,
        title: title?.trim() || undefined,
        ...parseDate(date),
        media: [{ kind: 'text', text }],
        personIds,
      });
      const summary = toSummary(memory, origin, 200);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Saved to ${summary.collections.join(', ') || 'Personal'}: ${summary.url}`,
          },
        ],
        structuredContent: { memory: summary },
      };
    }),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Comment on a memory',
      description:
        'Add a comment to a memory as the user. Everyone who can see the memory can see the comment.',
      inputSchema: {
        memory_id: z.string().min(1).max(64),
        text: z.string().min(1).max(4000),
      },
      annotations: WRITE,
    },
    safe(async ({ memory_id, text }) => {
      await caller.comments.create({ storyId: memory_id, body: text });
      return { content: [{ type: 'text' as const, text: 'Comment added.' }] };
    }),
  );

  registerLoreViews(server, caller, origin);
  return server;
}
