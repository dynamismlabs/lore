import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, createUser, memoryStorage, type TestDb, textMemory } from './helpers';

let t: TestDb;
const storage = memoryStorage();
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  await t.dispose();
});

async function video(userId: string, name: string) {
  const key = `u/${userId}/${name}.webm`;
  await storage.put(key, new ArrayBuffer(16), 'video/webm', 16);
  return key;
}

describe('one second a day', () => {
  it('keeps seconds out of the regular feeds and search, and lists them by date', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const regular = await alex.caller.stories.create({ title: 'Regular day', ...textMemory('hello') });
    const second = await alex.caller.stories.create({
      format: 'second',
      occurredAt: new Date('2026-10-30T18:00:00Z'),
      media: [{ kind: 'video', storageKey: await video(alex.id, 'a') }],
    });
    expect(second.format).toBe('second');

    expect((await alex.caller.stories.list({})).items.map((s) => s.id)).toEqual([regular.id]);
    expect((await alex.caller.stories.list({ format: 'second' })).items.map((s) => s.id)).toEqual([second.id]);
    expect(await alex.caller.stories.search({ q: 'Regular' })).toHaveLength(1);

    const seconds = await alex.caller.stories.seconds({
      from: new Date('2026-10-01T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
    });
    expect(seconds).toEqual([
      expect.objectContaining({ id: second.id, isMine: true, url: expect.stringMatching(/^\/api\/media\//) }),
    ]);
  });

  it('rejects anything that is not a single video', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    await expect(alex.caller.stories.create({ format: 'second', ...textMemory('nope') })).rejects.toThrow(
      /one short video/,
    );
  });

  it('shares a family montage through a collection, and only that', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const sam = await createUser(t.db, storage, 'Sam');
    const { id } = await alex.caller.collections.create({ name: 'Family' });
    const { url } = await alex.caller.invites.create({ collectionId: id, role: 'contributor' });
    await sam.caller.invites.accept({ token: url.split('/invite/')[1] });
    const range = { from: new Date('2026-01-01'), to: new Date('2027-01-01') };
    const day = new Date('2026-10-30T18:00:00Z');
    await alex.caller.stories.create({ format: 'second', collectionId: id, occurredAt: day, media: [{ kind: 'video', storageKey: await video(alex.id, 'f') }] });
    await alex.caller.stories.create({ format: 'second', occurredAt: day, media: [{ kind: 'video', storageKey: await video(alex.id, 'p') }] });
    await sam.caller.stories.create({ format: 'second', collectionId: id, occurredAt: day, media: [{ kind: 'video', storageKey: await video(sam.id, 's') }] });

    const family = await sam.caller.stories.seconds({ ...range, collectionIds: [id] });
    expect(family.map((s) => s.author.name).sort()).toEqual(['Alex', 'Sam']);
    expect((await sam.caller.stories.seconds(range)).length).toBe(2); // Alex's private one stays private
    expect((await alex.caller.stories.seconds({ ...range, onlyMine: true })).length).toBe(2);
  });
});

describe('collection counts', () => {
  it('counts memories, not vibes', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const { id } = await alex.caller.collections.create({ name: 'Family' });
    await alex.caller.stories.create({ collectionId: id, ...textMemory('a memory') });
    await alex.caller.stories.create({ format: 'second', collectionId: id, media: [{ kind: 'video', storageKey: await video(alex.id, 'v') }] });
    expect((await alex.caller.collections.byId({ id })).storyCount).toBe(1);
    expect((await alex.caller.collections.list()).find((c) => c.id === id)?.storyCount).toBe(1);
  });
});

describe('story mode order', () => {
  it('plays a collection from the oldest memory, page by page', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const { id } = await alex.caller.collections.create({ name: 'Family' });
    const at = (iso: string) => new Date(iso);
    const middle = await alex.caller.stories.create({ collectionId: id, occurredAt: at('2025-06-01T12:00:00Z'), ...textMemory('middle') });
    const newest = await alex.caller.stories.create({ collectionId: id, occurredAt: at('2026-06-01T12:00:00Z'), ...textMemory('newest') });
    const oldest = await alex.caller.stories.create({ collectionId: id, occurredAt: at('2024-06-01T12:00:00Z'), ...textMemory('oldest') });

    const first = await alex.caller.stories.list({ collectionId: id, sort: 'oldest', limit: 2 });
    expect(first.items.map((s) => s.id)).toEqual([oldest.id, middle.id]);
    const rest = await alex.caller.stories.list({ collectionId: id, sort: 'oldest', limit: 2, cursor: first.nextCursor });
    expect(rest.items.map((s) => s.id)).toEqual([newest.id]);
    expect(rest.nextCursor).toBeNull();
    // The collection page itself stays newest first.
    const page = await alex.caller.stories.list({ collectionId: id, sort: 'occurred' });
    expect(page.items.map((s) => s.id)).toEqual([newest.id, middle.id, oldest.id]);
  });
});

describe('timeline', () => {
  it('filters across several collections at once', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const a = await alex.caller.collections.create({ name: 'Trips' });
    const b = await alex.caller.collections.create({ name: 'Kids' });
    const c = await alex.caller.collections.create({ name: 'Work' });
    const inA = await alex.caller.stories.create({ collectionId: a.id, ...textMemory('a') });
    const inB = await alex.caller.stories.create({ collectionId: b.id, ...textMemory('b') });
    await alex.caller.stories.create({ collectionId: c.id, ...textMemory('c') });
    const page = await alex.caller.stories.list({ collectionIds: [a.id, b.id], sort: 'occurred' });
    expect(page.items.map((s) => s.id).sort()).toEqual([inA.id, inB.id].sort());

    const stranger = await createUser(t.db, storage, 'Kim');
    await expect(stranger.caller.stories.list({ collectionIds: [a.id] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('finds memories from this day in past years, in the viewer’s time zone', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    // Denver (UTC-6 in summer → offset 360). 9pm local on 2024-06-03 is 03:00Z on 06-04.
    const lastYear = await alex.caller.stories.create({ occurredAt: new Date('2025-06-04T03:00:00Z'), ...textMemory('one year ago') });
    await alex.caller.stories.create({ occurredAt: new Date('2025-06-05T03:00:00Z'), ...textMemory('wrong day') });
    await alex.caller.stories.create({ occurredAt: new Date('2026-06-04T03:00:00Z'), ...textMemory('this year') });
    const found = await alex.caller.stories.onThisDay({ today: '2026-06-03', tzOffsetMinutes: 360 });
    expect(found.map((s) => s.id)).toEqual([lastYear.id]);
  });
});
