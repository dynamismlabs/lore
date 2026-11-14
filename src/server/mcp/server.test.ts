import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLoreMcpServer } from './server';
import {
  type TestDb,
  createTestDb,
  createUser,
  memoryStorage,
  textMemory,
} from '@/server/trpc/__tests__/helpers';

let t: TestDb;
const storage = memoryStorage();
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.dispose();
});

async function connect(viewer: { id: string; name: string; email: string; image: null }) {
  const server = createLoreMcpServer({ db: t.db, viewer, storage, origin: 'https://lore.test' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

type TextContent = { type: 'text'; text: string }[];

describe('Lore MCP server', () => {
  it('lists tools with honest read/write annotations and no delete tools', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const client = await connect(alex.viewer);
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(Object.keys(byName).sort()).toEqual([
      'add_comment',
      'get_memory',
      'list_collections',
      'list_people',
      'list_recent_memories',
      'open_lore',
      'save_memory',
      'search_memories',
      'show_memories',
    ]);
    for (const name of [
      'search_memories',
      'list_recent_memories',
      'get_memory',
      'list_collections',
      'list_people',
    ]) {
      expect(byName[name].annotations?.readOnlyHint, name).toBe(true);
    }
    for (const name of ['save_memory', 'add_comment']) {
      expect(byName[name].annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    }
  });

  it('saves a memory with people and a date, then finds it', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const client = await connect(alex.viewer);
    const saved = await client.callTool({
      name: 'save_memory',
      arguments: {
        text: 'Maya lost her first tooth at dinner.',
        title: 'First tooth',
        date: '2026-10-30',
        people: ['Maya', 'maya'],
      },
    });
    expect(saved.isError).toBeFalsy();
    const memory = (
      saved.structuredContent as {
        memory: { id: string; date: string; people: string[]; collections: string[] };
      }
    ).memory;
    expect(memory).toMatchObject({
      date: '2026-10-30',
      people: ['Maya'],
      collections: ['Personal'],
    });

    const found = await client.callTool({ name: 'search_memories', arguments: { query: 'tooth' } });
    expect((found.content as TextContent)[0].text).toContain('First tooth');
    expect((found.content as TextContent)[0].text).toContain(
      `https://lore.test/memories/${memory.id}`,
    );

    const people = await client.callTool({ name: 'list_people', arguments: {} });
    expect(
      (people.structuredContent as { people: { name: string; memories: number }[] }).people,
    ).toEqual([expect.objectContaining({ name: 'Maya', memories: 1 })]);
  });

  it('only sees what the signed-in person can see', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const sam = await createUser(t.db, storage, 'Sam');
    const secret = await alex.caller.stories.create(textMemory('Surprise party plans for Sam'));
    const client = await connect(sam.viewer);

    const search = await client.callTool({
      name: 'search_memories',
      arguments: { query: 'surprise' },
    });
    expect((search.content as TextContent)[0].text).toMatch(/No memories match/);
    const get = await client.callTool({ name: 'get_memory', arguments: { memory_id: secret.id } });
    expect(get.isError).toBe(true);
    const comment = await client.callTool({
      name: 'add_comment',
      arguments: { memory_id: secret.id, text: 'hi' },
    });
    expect(comment.isError).toBe(true);
  });

  it('respects collection roles when saving', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const gran = await createUser(t.db, storage, 'Gran');
    const { id } = await alex.caller.collections.create({ name: 'Family' });
    const { url } = await alex.caller.invites.create({ collectionId: id, role: 'viewer' });
    await gran.caller.invites.accept({ token: url.split('/invite/')[1] });
    const client = await connect(gran.viewer);
    const result = await client.callTool({
      name: 'save_memory',
      arguments: { text: 'hello', collection_id: id },
    });
    expect(result.isError).toBe(true);
    expect((result.content as TextContent)[0].text).toMatch(/can view/i);
  });
});
