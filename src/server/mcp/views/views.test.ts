import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyMediaLink } from '@/lib/server/media-links';
import { LORE_VIEW_URI } from './tools';
import type { HomeView, MemoriesView } from './types';
import {
  type TestDb,
  createTestDb,
  createUser,
  memoryStorage,
  textMemory,
} from '@/server/trpc/__tests__/helpers';
import { GENERATED_VIEW_FILE, renderGeneratedView } from '../../../../scripts/build-mcp-views';
import { createLoreMcpServer } from '../server';

let t: TestDb;
const storage = memoryStorage();
const ORIGIN = 'https://lore.test';
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.dispose();
});

async function connect(viewer: { id: string; name: string; email: string; image: null }) {
  const server = createLoreMcpServer({ db: t.db, viewer, storage, origin: ORIGIN });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

async function upload(userId: string, name: string, contentType: string) {
  const key = `u/${userId}/${name}`;
  await storage.put(key, new ArrayBuffer(16), contentType, 16);
  return key;
}

/** `https://lore.test/api/media/<id>?exp=…&sig=…` → whether the server would accept it. */
async function accepted(link: string) {
  const url = new URL(link);
  expect(url.origin).toBe(ORIGIN);
  const id = url.pathname.split('/').pop()!;
  return verifyMediaLink(id, url.searchParams.get('exp'), url.searchParams.get('sig'));
}

describe('Lore MCP view', () => {
  it('keeps the view on the render tools and off the data tools', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const client = await connect(alex.viewer);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const meta = tool._meta as Record<string, unknown> | undefined;
      if (tool.name === 'show_memories' || tool.name === 'open_lore') {
        expect(meta, tool.name).toMatchObject({
          ui: { resourceUri: LORE_VIEW_URI },
          'openai/outputTemplate': LORE_VIEW_URI,
          'openai/widgetAccessible': true,
        });
        expect(tool.annotations?.readOnlyHint).toBe(true);
      } else {
        expect(meta?.ui, tool.name).toBeUndefined();
        expect(meta?.['openai/outputTemplate'], tool.name).toBeUndefined();
      }
    }
    const open = tools.find((tool) => tool.name === 'open_lore')!;
    expect(Object.keys(open.inputSchema.properties ?? {})).toEqual([]);
    expect(open._meta).toMatchObject({ 'openai/ui': { entrypoints: [{ type: 'global' }] } });
  });

  it('serves one page that may load only Lore’s own address', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const client = await connect(alex.viewer);
    const { resources } = await client.listResources();
    expect(resources).toEqual([
      expect.objectContaining({ uri: LORE_VIEW_URI, mimeType: 'text/html;profile=mcp-app' }),
    ]);
    const { contents } = await client.readResource({ uri: LORE_VIEW_URI });
    expect(contents[0]).toMatchObject({
      mimeType: 'text/html;profile=mcp-app',
      _meta: {
        ui: { csp: { connectDomains: [], resourceDomains: [ORIGIN] }, prefersBorder: true },
      },
    });
    const html = String((contents[0] as { text: string }).text);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/); // no network addresses baked in
  });

  it('shows the memories asked for, with signed media links, and skips what the person can’t see', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const sam = await createUser(t.db, storage, 'Sam');
    const lake = await alex.caller.stories.create({
      title: 'First fish',
      media: [
        { kind: 'text', text: 'Maya caught her first fish at the lake.' },
        { kind: 'image', storageKey: await upload(alex.id, 'a.jpg', 'image/jpeg') },
        { kind: 'image', storageKey: await upload(alex.id, 'b.jpg', 'image/jpeg') },
        { kind: 'audio', storageKey: await upload(alex.id, 'v.webm', 'audio/webm') },
      ],
    });
    const samsSecret = await sam.caller.stories.create(textMemory('Sam’s private note'));
    const client = await connect(alex.viewer);

    const result = await client.callTool({
      name: 'show_memories',
      arguments: { memory_ids: [lake.id, samsSecret.id, 'nope'], title: 'At the lake' },
    });
    expect(result.isError).toBeFalsy();
    const view = result.structuredContent as unknown as MemoriesView;
    expect(view).toMatchObject({ view: 'memories', title: 'At the lake', missing: 2 });
    expect(view.memories).toHaveLength(1);
    const [memory] = view.memories;
    expect(memory).toMatchObject({
      id: lake.id,
      title: 'First fish',
      excerpt: 'Maya caught her first fish at the lake.',
      photoCount: 2,
      url: `${ORIGIN}/memories/${lake.id}`,
    });
    expect(memory.photos).toHaveLength(2);
    for (const link of [...memory.photos, memory.voice!.url!])
      expect(await accepted(link)).toBeTruthy();
    // The model gets a short summary, not the links.
    const text = (result.content as { text: string }[])[0].text;
    expect(text).toContain('First fish');
    expect(text).not.toContain('sig=');
    expect(text).toMatch(/2 of the requested memories couldn’t be found/);
  });

  it('searches and opens Lore with this week’s vibes', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    await alex.caller.stories.create(textMemory('Pancakes on Sunday'));
    await alex.caller.stories.create({
      format: 'second',
      media: [{ kind: 'video', storageKey: await upload(alex.id, 'vibe.mp4', 'video/mp4') }],
    });
    const client = await connect(alex.viewer);

    const found = await client.callTool({
      name: 'show_memories',
      arguments: { query: 'pancakes' },
    });
    const results = found.structuredContent as unknown as MemoriesView;
    expect(results).toMatchObject({ query: 'pancakes', title: '“pancakes”' });
    expect(results.memories.map((m) => m.excerpt)).toEqual(['Pancakes on Sunday']);

    const opened = await client.callTool({ name: 'open_lore', arguments: {} });
    const home = opened.structuredContent as unknown as HomeView;
    expect(home.view).toBe('home');
    expect(home.memories.map((m) => m.excerpt)).toEqual(['Pancakes on Sunday']); // vibes stay out of the list
    expect(home.vibes).toHaveLength(1);
    expect(await accepted(home.vibes[0].url!)).toBeTruthy();
  });
});

describe('signed media links', () => {
  it('only open the file they were made for, until they expire', async () => {
    const { mediaLinkSigner } = await import('@/lib/server/media-links');
    const now = Date.UTC(2026, 10, 10, 12, 0, 0);
    const sign = (await mediaLinkSigner(ORIGIN, now))!;
    const url = new URL(await sign('media-1'));
    const exp = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');
    expect(await verifyMediaLink('media-1', exp, sig, now)).toBe(Number(exp));
    expect(await verifyMediaLink('media-2', exp, sig, now)).toBeNull();
    expect(await verifyMediaLink('media-1', String(Number(exp) + 1), sig, now)).toBeNull();
    expect(await verifyMediaLink('media-1', exp, `${sig!.slice(0, -1)}A`, now)).toBeNull();
    expect(await verifyMediaLink('media-1', exp, sig, Number(exp))).toBeNull(); // expired
    expect(await verifyMediaLink('media-1', exp, null, now)).toBeNull();
    // About an hour, rounded up to ten minutes so repeat views reuse the browser cache.
    expect(Number(exp) - now).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(Number(exp) - now).toBeLessThanOrEqual(70 * 60 * 1000);
  });
});

describe('the built page', () => {
  it('matches the client source (run pnpm mcp-views:build)', async () => {
    expect(await fs.readFile(GENERATED_VIEW_FILE, 'utf8')).toBe(await renderGeneratedView());
  });
});
