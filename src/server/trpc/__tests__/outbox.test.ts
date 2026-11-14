import { v7 as uuidv7 } from 'uuid';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type TestDb, createTestDb, createUser, memoryStorage, textMemory } from './helpers';

let t: TestDb;
let storage: ReturnType<typeof memoryStorage>;

beforeEach(async () => {
  t = await createTestDb();
  storage = memoryStorage();
});
afterEach(async () => {
  await t.dispose();
});

describe('saving from the offline outbox', () => {
  it('uses the device’s id, and a retry returns the saved memory instead of a copy', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const clientId = uuidv7();
    const first = await alex.caller.stories.create({
      ...textMemory('Pancakes at the cabin'),
      clientId,
    });
    expect(first.id).toBe(clientId);

    // The response was lost; the outbox sends it again.
    const again = await alex.caller.stories.create({
      ...textMemory('Pancakes at the cabin'),
      clientId,
    });
    expect(again.id).toBe(clientId);
    const feed = await alex.caller.stories.list({});
    expect(feed.items.map((s) => s.id)).toEqual([clientId]);
    expect(feed.items[0].media).toHaveLength(1);
  });

  it('won’t reuse someone else’s memory id, and only takes UUIDs', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const sam = await createUser(t.db, storage, 'Sam');
    const clientId = uuidv7();
    await alex.caller.stories.create({ ...textMemory('Mine'), clientId });
    await expect(
      sam.caller.stories.create({ ...textMemory('Also mine?'), clientId }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(sam.caller.stories.byId({ id: clientId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      alex.caller.stories.create({ ...textMemory('Bad id'), clientId: 'not-a-uuid' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
