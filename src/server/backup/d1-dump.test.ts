/**
 * The nightly backup must restore: dump a populated D1, load the dump into an
 * empty database, and get the same data back.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { dumpD1, gzip } from './d1-dump';
import { getDatabaseProvider } from '@/db/provider';
import {
  type TestDb,
  createTestDb,
  createUser,
  memoryStorage,
  textMemory,
} from '@/server/trpc/__tests__/helpers';

const describeD1 = getDatabaseProvider() === 'd1' ? describe : describe.skip;

describeD1('D1 backup dump', () => {
  const open: { dispose: () => Promise<void> }[] = [];
  afterEach(async () => {
    while (open.length) await open.pop()!.dispose();
  });

  async function rawD1() {
    const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        modules: true,
        script: 'export default { fetch() { return new Response(null) } }',
        d1Databases: { DB: `restore-${Date.now()}-${Math.random()}` },
      }),
    );
    open.push({ dispose: () => mf.dispose() });
    return mf.getD1Database('DB');
  }

  it('round-trips schema and rows, including quotes and unicode', async () => {
    const t: TestDb = await createTestDb();
    open.push(t);
    const storage = memoryStorage();
    const alex = await createUser(t.db, storage, "Alex O'Neil");
    await alex.caller.stories.create({
      title: 'It’s “quoted”',
      ...textMemory("Maya's first fish 🎣\nline two"),
    });
    const { id } = await alex.caller.collections.create({ name: 'Family' });
    await alex.caller.invites.create({ collectionId: id, role: 'viewer' });

    // Reach the underlying D1 binding of the test database.
    const source = (t.db as unknown as { $client: D1Database }).$client;
    const dump = await dumpD1(source);
    expect(dump.tables).toBeGreaterThan(10);
    expect(dump.rows).toBeGreaterThan(5);
    expect((await gzip(dump.sql)).byteLength).toBeGreaterThan(0);

    const target = await rawD1();
    const statements = dump.sql
      .split('\n')
      .filter((line) => line && !line.startsWith('--'))
      .join('\n')
      .split(/;\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) await target.prepare(statement).run();

    for (const table of [
      'users',
      'collections',
      'collection_members',
      'stories',
      'story_media',
      'collection_invites',
    ]) {
      const a = await source.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      const b = await target.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      expect(b.results, table).toEqual(a.results);
    }
  });
});
