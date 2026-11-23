/**
 * Lore's MCP Apps view for assistants that draw one (ChatGPT, Claude, Ri),
 * following Ri's own pattern (render tools apart from data tools). The model
 * still reads with search_memories, list_recent_memories and get_memory, and
 * calls these when the person should see the memories themselves:
 *
 * - `show_memories`: a card of memories, with photos, voice notes and clips.
 * - `open_lore`: Lore as a small full-screen app (ChatGPT lists it in its
 *   sidebar): this week's vibes, recent memories and a search.
 *
 * One HTML page draws both. It loads media from Lore's address only, through
 * short-lived signed links (`media-links.ts`); everything else is tool calls.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { RouterOutputs } from '@/lib/client/trpc';
import { type MediaLinkSigner, mediaLinkSigner } from '@/lib/server/media-links';
import { LORE_VIEW_HTML } from './lore-view.html';
import type { HomeView, MemoriesView, ViewMemory } from './types';
import type { appRouter } from '@/server/trpc/root';

type Memory = RouterOutputs['stories']['byId'];
type Caller = ReturnType<typeof appRouter.createCaller>;

export const LORE_VIEW_URI = 'ui://lore/memories.html';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';
export const VIEW_LIMIT = 25;
const HOME_MEMORIES = 15;

/**
 * The page may load images, audio and video from Lore's own address (signed
 * links) and nothing else. It opens as a card in a chat and can go full screen.
 */
export function viewResourceMeta(origin: string) {
  return {
    ui: { csp: { connectDomains: [], resourceDomains: [origin] }, prefersBorder: true },
    'openai/widgetCSP': { connect_domains: [], resource_domains: [origin] },
    'openai/ui': {
      availableDisplayModes: ['inline', 'fullscreen'],
      preferredDisplayMode: 'inline',
    },
  };
}

function renderMeta(invoking: string, invoked: string) {
  return {
    ui: { resourceUri: LORE_VIEW_URI },
    'openai/outputTemplate': LORE_VIEW_URI,
    'openai/widgetAccessible': true,
    'openai/toolInvocation/invoking': invoking,
    'openai/toolInvocation/invoked': invoked,
  };
}

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function clip(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const mediaIdOf = (url: string) => url.slice(url.lastIndexOf('/') + 1);

async function toViewMemory(
  memory: Memory,
  origin: string,
  sign: MediaLinkSigner | null,
): Promise<ViewMemory> {
  const text = memory.media
    .filter((m) => m.kind === 'text')
    .map((m) => m.text ?? '')
    .join('\n\n');
  const audio = memory.media.filter((m) => m.kind === 'audio');
  const transcript = audio.map((m) => m.text ?? '').join(' ');
  const images = memory.media.filter((m) => m.kind === 'image');
  const video = memory.media.find((m) => m.kind === 'video');
  const link = (mediaId: string) => (sign ? sign(mediaId) : Promise.resolve(null));
  return {
    id: memory.id,
    title: memory.title,
    occurredAt: memory.occurredAt.toISOString(),
    occurredPrecision: memory.occurredPrecision,
    author: memory.author.name,
    isMine: memory.isMine,
    collections: memory.collections.map((c) => c.name),
    people: memory.people.map((p) => p.name),
    excerpt: clip(text, 400) ?? clip(transcript, 400),
    photos: sign ? await Promise.all(images.slice(0, 3).map((image) => sign(image.id))) : [],
    photoCount: images.length,
    voice: audio[0] ? { url: await link(audio[0].id), durationMs: audio[0].durationMs } : null,
    video: video ? await link(video.id) : null,
    hearts: memory.heartCount,
    comments: memory.commentCount,
    url: `${origin}/memories/${memory.id}`,
  };
}

function describeShown(memories: ViewMemory[]) {
  return memories
    .map((m) => {
      const name = m.title ?? clip(m.excerpt ?? '', 50) ?? 'Untitled';
      return `“${name}” (${m.occurredAt.slice(0, 10)}, id ${m.id})`;
    })
    .join('; ');
}

function failure(error: unknown) {
  const message =
    error instanceof TRPCError || error instanceof Error ? error.message : 'Something went wrong';
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

const showMemoriesInput = {
  title: z
    .string()
    .max(80)
    .optional()
    .describe('A short heading for the card, such as "Summer at the lake" or "Saved just now".'),
  memory_ids: z
    .array(z.string().min(1).max(64))
    .max(VIEW_LIMIT)
    .optional()
    .describe(
      'Show exactly these memories, in this order: ones you just saved, found or read. Use it after search_memories or save_memory.',
    ),
  query: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Without memory_ids: show memories matching these words.'),
  collection_id: z
    .string()
    .max(64)
    .optional()
    .describe('Without memory_ids or query: only this collection (ids from list_collections).'),
  person_id: z
    .string()
    .max(64)
    .optional()
    .describe(
      'Without memory_ids or query: only memories with this person (ids from list_people).',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(VIEW_LIMIT)
    .optional()
    .describe(`How many to show, up to ${VIEW_LIMIT}. Defaults to every named memory, or 10.`),
};

export function registerLoreViews(server: McpServer, caller: Caller, origin: string) {
  let signer: Promise<MediaLinkSigner | null> | null = null;
  const sign = () => (signer ??= mediaLinkSigner(origin));
  const meta = viewResourceMeta(origin);

  server.registerResource(
    'lore-view',
    LORE_VIEW_URI,
    {
      title: 'Lore',
      description:
        'Memories from Lore with their photos, voice notes and clips, and this week’s vibes.',
      mimeType: MCP_APP_MIME,
      _meta: meta,
    },
    () => ({
      contents: [{ uri: LORE_VIEW_URI, mimeType: MCP_APP_MIME, text: LORE_VIEW_HTML, _meta: meta }],
    }),
  );

  server.registerTool(
    'show_memories',
    {
      title: 'Show memories',
      description:
        'Show the person memories in an interactive card where they can see the photos, play voice notes and clips, and open each one in Lore. Pass memory_ids to show particular memories (ones you just found, read or saved), or a query, collection or person like the list tools. Use it when seeing the memories helps the person. To read memories yourself, use search_memories, list_recent_memories or get_memory.',
      inputSchema: showMemoriesInput,
      annotations: READ,
      _meta: renderMeta('Getting your memories', 'Your memories'),
    },
    async ({ title, memory_ids, query, collection_id, person_id, limit }) => {
      try {
        const signLinks = await sign();
        let found: Memory[] = [];
        let missing = 0;
        let more = false;
        if (memory_ids?.length) {
          const ids = [...new Set(memory_ids)].slice(0, limit ?? VIEW_LIMIT);
          const settled = await Promise.allSettled(ids.map((id) => caller.stories.byId({ id })));
          for (const result of settled) {
            if (result.status === 'fulfilled') found.push(result.value);
            else missing++;
          }
        } else if (query) {
          const results = await caller.stories.search({ q: query });
          found = results.slice(0, limit ?? 10);
          more = results.length > found.length;
        } else {
          const page = await caller.stories.list({
            collectionId: collection_id,
            personId: person_id,
            sort: collection_id || person_id ? 'occurred' : 'recent',
            limit: limit ?? 10,
          });
          found = page.items;
          more = page.nextCursor != null;
        }
        const memories = await Promise.all(found.map((m) => toViewMemory(m, origin, signLinks)));
        const view: MemoriesView = {
          view: 'memories',
          title:
            title ?? (memory_ids?.length ? 'Memories' : query ? `“${query}”` : 'Recent memories'),
          query: memory_ids?.length ? null : (query ?? null),
          memories,
          missing,
          more,
          loreUrl: origin,
        };
        const summary = memories.length
          ? `Showing ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} in Lore: ${describeShown(memories)}.`
          : query
            ? `No memories match “${query}”.`
            : 'No memories to show.';
        const note = missing ? ` ${missing} of the requested memories couldn’t be found.` : '';
        return {
          content: [{ type: 'text' as const, text: summary + note }],
          structuredContent: view as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return failure(error);
      }
    },
  );

  // A person opens this one from ChatGPT's sidebar (OpenAI's global entrypoint). It stays visible to
  // the model: ChatGPT won't draw the view of a tool hidden from it.
  server.registerTool(
    'open_lore',
    {
      title: 'Lore',
      description:
        'Opens Lore as a full-screen app for the person: this week’s vibes, their recent memories and a search. People usually open it themselves from the app’s sidebar. To show particular memories in a chat, use show_memories instead.',
      annotations: READ,
      _meta: {
        ...renderMeta('Opening Lore', 'Lore'),
        'openai/ui': { entrypoints: [{ type: 'global' }] },
      },
    },
    async () => {
      try {
        const signLinks = await sign();
        const now = Date.now();
        const [page, clips] = await Promise.all([
          caller.stories.list({ sort: 'recent', limit: HOME_MEMORIES }),
          caller.stories.seconds({
            from: new Date(now - 8 * 86_400_000),
            to: new Date(now + 86_400_000),
            onlyMine: true,
          }),
        ]);
        const view: HomeView = {
          view: 'home',
          vibes: await Promise.all(
            clips.map(async (c) => ({
              occurredAt: c.occurredAt.toISOString(),
              url: signLinks ? await signLinks(mediaIdOf(c.url)) : null,
            })),
          ),
          memories: await Promise.all(page.items.map((m) => toViewMemory(m, origin, signLinks))),
          loreUrl: origin,
        };
        return {
          content: [
            {
              type: 'text' as const,
              text: `Opened Lore: ${view.memories.length} recent ${view.memories.length === 1 ? 'memory' : 'memories'} and ${view.vibes.length} ${view.vibes.length === 1 ? 'vibe' : 'vibes'} from the last week.`,
            },
          ],
          structuredContent: view as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return failure(error);
      }
    },
  );
}
