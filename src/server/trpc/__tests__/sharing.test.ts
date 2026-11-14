import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Storage } from '@/services/server/storage';
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

const tokenFrom = (url: string) => url.split('/invite/')[1];

async function family() {
  const alex = await createUser(t.db, storage as Storage, 'Alex');
  const sam = await createUser(t.db, storage as Storage, 'Sam');
  const { id: collectionId } = await alex.caller.collections.create({ name: 'Summer 2026' });
  const invite = await alex.caller.invites.create({ collectionId, role: 'contributor' });
  await sam.caller.invites.accept({ token: tokenFrom(invite.url) });
  return { alex, sam, collectionId };
}

describe('collections & Personal', () => {
  it('gives every user a private Personal collection, listed after shared collections', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    await alex.caller.collections.create({ name: 'Trips' });
    const list = await alex.caller.collections.list();
    expect(list.map((c) => c.name)).toEqual(['Trips', 'Personal']);
    expect(list[1]).toMatchObject({ isDefault: true, role: 'owner', memberCount: 1 });
  });

  it('saves to Personal when no collectionId is passed and keeps it private', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const sam = await createUser(t.db, storage, 'Sam');
    const story = await alex.caller.stories.create(textMemory('Maya caught her first fish'));
    expect(story.collections.map((c) => c.name)).toEqual(['Personal']);

    const feed = await alex.caller.stories.list({});
    expect(feed.items.map((s) => s.id)).toEqual([story.id]);
    expect(feed.items[0].media[0]).toMatchObject({
      kind: 'text',
      text: 'Maya caught her first fish',
    });

    await expect(sam.caller.stories.byId({ id: story.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await sam.caller.stories.list({})).items).toEqual([]);
  });

  it('refuses to share or delete Personal', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const [personal] = await alex.caller.collections.list();
    await expect(
      alex.caller.invites.create({ collectionId: personal.id, role: 'viewer' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(alex.caller.collections.delete({ id: personal.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('invites', () => {
  it('lets an invited contributor see and add memories', async () => {
    const { alex, sam, collectionId } = await family();

    const fromAlex = await alex.caller.stories.create({ collectionId, ...textMemory('Beach day') });
    const fromSam = await sam.caller.stories.create({ collectionId, ...textMemory('Ice cream') });

    const samFeed = await sam.caller.stories.list({ collectionId, sort: 'occurred' });
    expect(samFeed.items.map((s) => s.id).sort()).toEqual([fromAlex.id, fromSam.id].sort());
    const alexHome = await alex.caller.stories.list({});
    expect(alexHome.items.find((s) => s.id === fromSam.id)?.author.name).toBe('Sam');

    const detail = await alex.caller.collections.byId({ id: collectionId });
    expect(detail.members.map((m) => [m.name, m.role])).toEqual([
      ['Alex', 'owner'],
      ['Sam', 'contributor'],
    ]);
  });

  it('shows a preview before sign-in and reports membership after', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const { id: collectionId } = await alex.caller.collections.create({ name: 'Grandma stories' });
    const { url } = await alex.caller.invites.create({ collectionId, role: 'viewer' });

    const { appRouter } = await import('../root');
    const anonymous = appRouter.createCaller({ db: t.db, viewer: null, storage, origin: 'x' });
    expect(await anonymous.invites.preview({ token: tokenFrom(url) })).toMatchObject({
      status: 'valid',
      collectionName: 'Grandma stories',
      inviterName: 'Alex',
      role: 'viewer',
    });
    expect((await alex.caller.invites.preview({ token: tokenFrom(url) })).status).toBe('member');
    expect((await anonymous.invites.preview({ token: 'nope-nope-nope' })).status).toBe('invalid');
  });

  it('is single-use, and revocable', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const sam = await createUser(t.db, storage, 'Sam');
    const kim = await createUser(t.db, storage, 'Kim');
    const { id: collectionId } = await alex.caller.collections.create({ name: 'Family' });

    const first = await alex.caller.invites.create({ collectionId, role: 'contributor' });
    await sam.caller.invites.accept({ token: tokenFrom(first.url) });
    await expect(kim.caller.invites.accept({ token: tokenFrom(first.url) })).rejects.toThrow(
      /already been used/,
    );

    const second = await alex.caller.invites.create({ collectionId, role: 'contributor' });
    const [pending] = await alex.caller.invites.list({ collectionId });
    await alex.caller.invites.revoke({ id: pending.id });
    await expect(kim.caller.invites.accept({ token: tokenFrom(second.url) })).rejects.toThrow(
      /cancelled/,
    );
  });

  it('only lets the owner invite', async () => {
    const { sam, collectionId } = await family();
    await expect(sam.caller.invites.create({ collectionId, role: 'viewer' })).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
      },
    );
  });
});

describe('roles', () => {
  it('lets viewers read and comment but not add', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const gran = await createUser(t.db, storage, 'Gran');
    const { id: collectionId } = await alex.caller.collections.create({ name: 'Family' });
    const { url } = await alex.caller.invites.create({ collectionId, role: 'viewer' });
    await gran.caller.invites.accept({ token: tokenFrom(url) });

    const story = await alex.caller.stories.create({ collectionId, ...textMemory('First steps!') });
    await expect(
      gran.caller.stories.create({ collectionId, ...textMemory('nope') }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await gran.caller.comments.create({ storyId: story.id, body: 'So proud ❤️' });
    expect(await gran.caller.reactions.toggleHeart({ storyId: story.id })).toEqual({
      hearted: true,
    });
    const seen = await alex.caller.stories.byId({ id: story.id });
    expect(seen).toMatchObject({ commentCount: 1, heartCount: 1, heartedByMe: false });
    await expect(gran.caller.stories.update({ id: story.id, title: 'x' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('removing a member revokes access to the collection but not to their own memories', async () => {
    const { alex, sam, collectionId } = await family();
    const alexStory = await alex.caller.stories.create({
      collectionId,
      ...textMemory('Alex here'),
    });
    const samStory = await sam.caller.stories.create({ collectionId, ...textMemory('Sam here') });

    await alex.caller.collections.removeMember({ id: collectionId, userId: sam.id });
    await expect(sam.caller.stories.byId({ id: alexStory.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(sam.caller.collections.byId({ id: collectionId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await sam.caller.stories.byId({ id: samStory.id })).isMine).toBe(true);
  });
});

describe('moving and deleting', () => {
  it('moves memories that only lived in a deleted collection back to Personal', async () => {
    const { alex, sam, collectionId } = await family();
    const samStory = await sam.caller.stories.create({ collectionId, ...textMemory('Keep me') });
    const result = await alex.caller.collections.delete({ id: collectionId });
    expect(result.movedToMoments).toBe(1);
    const after = await sam.caller.stories.byId({ id: samStory.id });
    expect(after.collections.map((c) => c.name)).toEqual(['Personal']);
  });

  it('lets the author choose collections, but never zero', async () => {
    const { alex, collectionId } = await family();
    const story = await alex.caller.stories.create(textMemory('Organize me'));
    await alex.caller.stories.setCollections({ id: story.id, collectionIds: [collectionId] });
    expect(
      (await alex.caller.stories.byId({ id: story.id })).collections.map((c) => c.name),
    ).toEqual(['Summer 2026']);
    await expect(
      alex.caller.stories.setCollections({ id: story.id, collectionIds: [] }),
    ).rejects.toThrow();
  });

  it('owner removing someone else’s memory sends it home to their Personal', async () => {
    const { alex, sam, collectionId } = await family();
    const samStory = await sam.caller.stories.create({ collectionId, ...textMemory('Off topic') });
    await alex.caller.stories.removeFromCollection({ id: samStory.id, collectionId });
    await expect(alex.caller.stories.byId({ id: samStory.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const mine = await sam.caller.stories.byId({ id: samStory.id });
    expect(mine.collections.map((c) => c.name)).toEqual(['Personal']);
  });

  it('only the author can delete; deleting moves stored files to the trash', async () => {
    const { alex, sam, collectionId } = await family();
    const key = `u/${sam.id}/photo.jpg`;
    await storage.put(key, new TextEncoder().encode('jpeg').buffer as ArrayBuffer, 'image/jpeg', 4);
    const story = await sam.caller.stories.create({
      collectionId,
      media: [{ kind: 'image', storageKey: key, text: 'At the lake' }],
    });
    await expect(alex.caller.stories.delete({ id: story.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await sam.caller.stories.delete({ id: story.id });
    await new Promise((r) => setTimeout(r, 10));
    expect(storage.objects.has(key)).toBe(false);
    expect(storage.objects.has(`trash/${key}`)).toBe(true);
  });
});

describe('media', () => {
  it('rejects uploads that belong to someone else or do not exist', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const sam = await createUser(t.db, storage, 'Sam');
    const samKey = `u/${sam.id}/x.jpg`;
    await storage.put(samKey, new ArrayBuffer(3), 'image/jpeg', 3);
    await expect(
      alex.caller.stories.create({ media: [{ kind: 'image', storageKey: samKey }] }),
    ).rejects.toThrow(/does not belong/);
    await expect(
      alex.caller.stories.create({
        media: [{ kind: 'image', storageKey: `u/${alex.id}/missing.jpg` }],
      }),
    ).rejects.toThrow(/not found/);
  });

  it('stores voice notes with server-side size/type and marks transcripts unavailable without a provider', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const key = `u/${alex.id}/note.webm`;
    await storage.put(key, new ArrayBuffer(1234), 'audio/webm;codecs=opus', 1234);
    const story = await alex.caller.stories.create({
      media: [{ kind: 'audio', storageKey: key, durationMs: 4200 }],
    });
    expect(story.media[0]).toMatchObject({
      kind: 'audio',
      sizeBytes: 1234,
      contentType: 'audio/webm;codecs=opus',
      transcriptStatus: 'unavailable',
      durationMs: 4200,
      url: `/api/media/${story.media[0].id}`,
    });
    await alex.caller.media.updateText({ id: story.media[0].id, text: 'Typed it myself' });
    const after = await alex.caller.stories.byId({ id: story.id });
    expect(after.media[0]).toMatchObject({ text: 'Typed it myself', transcriptStatus: 'done' });
  });

  it('adds photos to an existing memory and refuses to remove the last item', async () => {
    const alex = await createUser(t.db, storage, 'Alex');
    const story = await alex.caller.stories.create(textMemory('Caption first'));
    const key = `u/${alex.id}/p.png`;
    await storage.put(key, new ArrayBuffer(8), 'image/png', 8);
    await alex.caller.media.addToStory({
      storyId: story.id,
      media: [{ kind: 'image', storageKey: key }],
    });
    const after = await alex.caller.stories.byId({ id: story.id });
    expect(after.media.map((m) => m.kind)).toEqual(['text', 'image']);
    await alex.caller.media.remove({ id: after.media[1].id });
    await expect(alex.caller.media.remove({ id: after.media[0].id })).rejects.toThrow(/only thing/);
  });
});

describe('people & search', () => {
  it('shares people through tagged memories and respects access', async () => {
    const { alex, sam, collectionId } = await family();
    const maya = await alex.caller.people.create({ name: 'Maya', relationship: 'daughter' });
    const story = await alex.caller.stories.create({
      collectionId,
      personIds: [maya.id],
      ...textMemory('Maya lost a tooth'),
    });
    const outsider = await createUser(t.db, storage, 'Kim');

    expect((await sam.caller.people.list()).map((p) => [p.name, p.storyCount, p.isMine])).toEqual([
      ['Maya', 1, false],
    ]);
    await expect(outsider.caller.people.byId({ id: maya.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // Sam (contributor) can tag Maya on their own memory and see her page.
    const samStory = await sam.caller.stories.create({
      collectionId,
      ...textMemory('Park with Maya'),
    });
    await sam.caller.people.tag({ storyId: samStory.id, personId: maya.id });
    const mayaFeed = await sam.caller.stories.list({ personId: maya.id, sort: 'occurred' });
    expect(mayaFeed.items.map((s) => s.id).sort()).toEqual([story.id, samStory.id].sort());
    await expect(sam.caller.people.update({ id: maya.id, name: 'M' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('searches titles and text the viewer can see, case-insensitively', async () => {
    const { alex, sam, collectionId } = await family();
    await alex.caller.stories.create({ collectionId, title: 'Lake Day', ...textMemory('Fishing') });
    await alex.caller.stories.create(textMemory('A private note about the LAKE'));
    await sam.caller.stories.create(textMemory('100% sure this matched_'));

    expect((await alex.caller.stories.search({ q: 'lake' })).length).toBe(2);
    expect((await sam.caller.stories.search({ q: 'lake' })).map((s) => s.title)).toEqual([
      'Lake Day',
    ]);
    expect((await sam.caller.stories.search({ q: '100%' })).length).toBe(1);
    expect((await sam.caller.stories.search({ q: '%' })).length).toBe(1);
  });
});
