import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoundMoment, MomentsInput } from '@/services/server/moments';
import { type TestDb, createTestDb, createUser, memoryStorage, textMemory } from './helpers';
import { storyMedia } from '@/db/schema';

const found = vi.hoisted(() => ({
  moments: [] as FoundMoment[],
  calls: [] as MomentsInput[],
}));

vi.mock('@/services/server/moments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/server/moments')>()),
  getMomentsProvider: () => 'groq',
  findMoments: async (input: MomentsInput) => {
    found.calls.push(input);
    return found.moments;
  },
}));

let t: TestDb;
let storage: ReturnType<typeof memoryStorage>;

beforeEach(async () => {
  t = await createTestDb();
  storage = memoryStorage();
  found.moments = [];
  found.calls = [];
});
afterEach(async () => {
  await t.dispose();
});

const tokenFrom = (url: string) => url.split('/invite/')[1];

const birth: FoundMoment = {
  title: 'The night she was born',
  summary: 'We drove to the hospital in the snow.',
  occurredAt: new Date('2019-03-03T12:00:00Z'),
  precision: 'day',
  startMs: 1_000,
  endMs: 60_000,
  people: [],
};
const firstSteps: FoundMoment = {
  title: 'First steps',
  summary: 'She walked across the kitchen.',
  occurredAt: new Date('2020-01-01T12:00:00Z'),
  precision: 'year',
  startMs: 61_000,
  endMs: 90_000,
  people: [{ id: null, name: 'Grandpa Joe' }],
};

/** Alex records a talk in a shared "Family" collection; Sam is a contributor there. */
async function conversation() {
  const alex = await createUser(t.db, storage, 'Alex');
  const sam = await createUser(t.db, storage, 'Sam');
  const { id: familyId } = await alex.caller.collections.create({ name: 'Family' });
  const invite = await alex.caller.invites.create({ collectionId: familyId, role: 'contributor' });
  await sam.caller.invites.accept({ token: tokenFrom(invite.url) });

  const key = `u/${alex.id}/talk.webm`;
  await storage.put(key, new ArrayBuffer(64), 'audio/webm', 64);
  const talk = await alex.caller.stories.create({
    collectionId: familyId,
    occurredAt: new Date('2026-11-20T20:00:00Z'),
    media: [{ kind: 'audio', storageKey: key, durationMs: 600_000 }],
  });
  const mediaId = talk.media[0].id;
  await t.db
    .update(storyMedia)
    .set({
      text: 'We drove to the hospital in the snow. She walked across the kitchen.',
      transcriptStatus: 'done',
      transcriptSegments: [
        { startMs: 1_000, endMs: 60_000, text: 'We drove to the hospital in the snow.' },
        { startMs: 61_000, endMs: 90_000, text: 'She walked across the kitchen.' },
      ],
    })
    .where(eq(storyMedia.id, mediaId));
  return { alex, sam, familyId, talk, mediaId };
}

describe('moments', () => {
  it('suggests moments to the recording’s author only', async () => {
    const { alex, sam, talk, mediaId } = await conversation();
    const ella = await alex.caller.people.create({ name: 'Ella', birthDate: '2019-03-03' });
    found.moments = [birth, firstSteps];

    expect(await alex.caller.moments.suggest({ mediaId })).toEqual({ found: 2 });
    expect(found.calls[0]).toMatchObject({
      recordedAt: new Date('2026-11-20T20:00:00Z'),
      segments: [
        expect.objectContaining({ startMs: 1_000 }),
        expect.objectContaining({ startMs: 61_000 }),
      ],
      people: [{ id: ella.id, name: 'Ella', relationship: null, birthDate: '2019-03-03' }],
    });

    const mine = await alex.caller.moments.forStory({ storyId: talk.id });
    expect(mine.suggestions.map((s) => s.title)).toEqual(['The night she was born', 'First steps']);
    expect(mine.findable).toEqual([mediaId]);

    const theirs = await sam.caller.moments.forStory({ storyId: talk.id });
    expect(theirs).toMatchObject({ suggestions: [], moments: [], findable: [] });
    await expect(sam.caller.moments.suggest({ mediaId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(sam.caller.moments.dismiss({ id: mine.suggestions[0].id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('adds a moment as its own memory, in the conversation’s collection, playing its clip', async () => {
    const { alex, sam, familyId, talk, mediaId } = await conversation();
    const ella = await alex.caller.people.create({ name: 'Ella' });
    found.moments = [
      { ...firstSteps, people: [{ id: ella.id, name: 'Ella' }, ...firstSteps.people] },
    ];
    await alex.caller.moments.suggest({ mediaId });
    const [suggestion] = (await alex.caller.moments.forStory({ storyId: talk.id })).suggestions;

    const { storyId } = await alex.caller.moments.accept({
      id: suggestion.id,
      occurredAt: new Date('2020-06-15T08:00:00Z'),
      occurredPrecision: 'month',
      personIds: [ella.id],
      newPeople: ['Grandpa Joe'],
    });
    // Accepting twice doesn't make a copy.
    expect(await alex.caller.moments.accept({ id: suggestion.id })).toEqual({ storyId });

    const moment = await sam.caller.stories.byId({ id: storyId });
    expect(moment).toMatchObject({
      title: 'First steps',
      occurredAt: new Date('2020-06-01T12:00:00Z'),
      occurredPrecision: 'month',
      media: [{ kind: 'text', text: 'She walked across the kitchen.' }],
      collections: [{ id: familyId }],
      clips: [
        {
          mediaId,
          url: `/api/media/${mediaId}`,
          startMs: 61_000,
          endMs: 90_000,
          source: { id: talk.id },
        },
      ],
    });
    expect(moment.people.map((p) => p.name).sort()).toEqual(['Ella', 'Grandpa Joe']);

    const after = await sam.caller.moments.forStory({ storyId: talk.id });
    expect(after.moments.map((m) => m.id)).toEqual([storyId]);
    expect((await alex.caller.moments.forStory({ storyId: talk.id })).suggestions).toEqual([]);
  });

  it('plays the clip only for people who can see the conversation', async () => {
    const { alex, sam, talk, mediaId } = await conversation();
    // The conversation is private; the moment goes to a collection Sam can see.
    await alex.caller.stories.setCollections({
      id: talk.id,
      collectionIds: [(await alex.caller.collections.list()).find((c) => c.isDefault)!.id],
    });
    found.moments = [birth];
    await alex.caller.moments.suggest({ mediaId });
    const [suggestion] = (await alex.caller.moments.forStory({ storyId: talk.id })).suggestions;
    const { id: kidsId } = await alex.caller.collections.create({ name: 'Kids' });
    const { storyId } = await alex.caller.moments.accept({ id: suggestion.id });
    await alex.caller.stories.setCollections({ id: storyId, collectionIds: [kidsId] });
    const invite = await alex.caller.invites.create({ collectionId: kidsId, role: 'viewer' });
    await sam.caller.invites.accept({ token: tokenFrom(invite.url) });

    expect((await alex.caller.stories.byId({ id: storyId })).clips).toHaveLength(1);
    const seen = await sam.caller.stories.byId({ id: storyId });
    expect(seen.media[0].text).toBe('We drove to the hospital in the snow.');
    expect(seen.clips).toEqual([]);
  });

  it('keeps added moments when the conversation is deleted, without the clip', async () => {
    const { alex, talk, mediaId } = await conversation();
    found.moments = [birth];
    await alex.caller.moments.suggest({ mediaId });
    const [suggestion] = (await alex.caller.moments.forStory({ storyId: talk.id })).suggestions;
    const { storyId } = await alex.caller.moments.accept({ id: suggestion.id });

    await alex.caller.stories.delete({ id: talk.id });
    const moment = await alex.caller.stories.byId({ id: storyId });
    expect(moment.clips).toEqual([]);
    expect(moment.media[0].text).toBe('We drove to the hospital in the snow.');
  });

  it('looking again replaces pending suggestions and skips added or dismissed ones', async () => {
    const { alex, talk, mediaId } = await conversation();
    found.moments = [birth, firstSteps];
    await alex.caller.moments.suggest({ mediaId });
    const [first, second] = (await alex.caller.moments.forStory({ storyId: talk.id })).suggestions;
    await alex.caller.moments.accept({ id: first.id });
    await alex.caller.moments.dismiss({ id: second.id });

    const bath: FoundMoment = { ...birth, title: 'Bath time', startMs: 91_000, endMs: 99_000 };
    found.moments = [{ ...birth, startMs: 2_000 }, { ...firstSteps, endMs: 89_000 }, bath];
    expect(await alex.caller.moments.suggest({ mediaId })).toEqual({ found: 1 });
    expect(await alex.caller.moments.suggest({ mediaId })).toEqual({ found: 1 });
    const { suggestions } = await alex.caller.moments.forStory({ storyId: talk.id });
    expect(suggestions.map((s) => s.title)).toEqual(['Bath time']);
  });

  it('needs a transcript to look through', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const key = `u/${alex.id}/quiet.webm`;
    await storage.put(key, new ArrayBuffer(8), 'audio/webm', 8);
    const story = await alex.caller.stories.create({ media: [{ kind: 'audio', storageKey: key }] });
    await expect(alex.caller.moments.suggest({ mediaId: story.media[0].id })).rejects.toMatchObject(
      { code: 'BAD_REQUEST' },
    );
    const text = await alex.caller.stories.create(textMemory('hello'));
    await expect(alex.caller.moments.suggest({ mediaId: text.media[0].id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('approximate dates', () => {
  it('snaps month and year dates to the start of the period', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const story = await alex.caller.stories.create({
      ...textMemory('Our year in Austin'),
      occurredAt: new Date('2019-08-20T15:00:00Z'),
      occurredPrecision: 'year',
    });
    expect(story).toMatchObject({
      occurredAt: new Date('2019-01-01T12:00:00Z'),
      occurredPrecision: 'year',
    });

    await alex.caller.stories.update({ id: story.id, occurredPrecision: 'month' });
    expect(await alex.caller.stories.byId({ id: story.id })).toMatchObject({
      occurredAt: new Date('2019-01-01T12:00:00Z'),
      occurredPrecision: 'month',
    });

    const exact = new Date('2019-08-20T15:00:00Z');
    await alex.caller.stories.update({ id: story.id, occurredAt: exact });
    expect(await alex.caller.stories.byId({ id: story.id })).toMatchObject({
      occurredAt: exact,
      occurredPrecision: 'day',
    });
  });

  it('leaves dates known only to the month or year out of “On this day”', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    await alex.caller.stories.create({
      ...textMemory('Sometime in 2019'),
      occurredAt: new Date('2019-01-01T12:00:00Z'),
      occurredPrecision: 'year',
    });
    const exact = await alex.caller.stories.create({
      ...textMemory('New Year’s Day 2020'),
      occurredAt: new Date('2020-01-01T12:00:00Z'),
    });
    const today = await alex.caller.stories.onThisDay({ today: '2026-01-01', tzOffsetMinutes: 0 });
    expect(today.map((s) => s.id)).toEqual([exact.id]);
  });
});

describe('birthdays', () => {
  it('stores a birth date on a person and rejects impossible ones', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const ella = await alex.caller.people.create({ name: 'Ella', birthDate: '2019-03-03' });
    expect((await alex.caller.people.byId({ id: ella.id })).birthDate).toBe('2019-03-03');
    await alex.caller.people.update({ id: ella.id, birthDate: null });
    expect((await alex.caller.people.list())[0].birthDate).toBeNull();
    await expect(
      alex.caller.people.update({ id: ella.id, birthDate: '2019-02-30' }),
    ).rejects.toThrow();
  });
});
