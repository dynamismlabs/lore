/**
 * Every access rule in Lore lives here. There is no row-level security in the
 * database, so any procedure that touches a specific resource calls one of
 * these first.
 *
 * Model: sharing is collection membership.
 * - Read a story: its author, or a member of any collection containing it.
 * - Edit/delete a story, or add it to another collection: its author.
 * - Add stories to a collection: owner or contributor.
 * - Tag people / caption on a story: its author, or an owner/contributor of a
 *   collection containing it.
 * - Manage a collection (rename, delete, members, invites): its owner.
 *
 * Resources the viewer can't read are reported as NOT_FOUND, so ids don't leak.
 */
import { TRPCError } from '@trpc/server';
import { type SQL, and, eq, exists, or, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import type { MemberRole } from '@/db/constants';
import { collectionMembers, collectionStories, collections, stories } from '@/db/schema';

const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, contributor: 1, owner: 2 };

export function roleAtLeast(role: MemberRole | null | undefined, min: MemberRole) {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function getMembershipRole(
  db: Db,
  userId: string,
  collectionId: string,
): Promise<MemberRole | null> {
  const [row] = await db
    .select({ role: collectionMembers.role })
    .from(collectionMembers)
    .where(
      and(eq(collectionMembers.collectionId, collectionId), eq(collectionMembers.userId, userId)),
    )
    .limit(1);
  return row?.role ?? null;
}

export async function requireCollectionRole(
  db: Db,
  userId: string,
  collectionId: string,
  min: MemberRole,
) {
  const [row] = await db
    .select({ collection: collections, role: collectionMembers.role })
    .from(collections)
    .innerJoin(
      collectionMembers,
      and(eq(collectionMembers.collectionId, collections.id), eq(collectionMembers.userId, userId)),
    )
    .where(eq(collections.id, collectionId))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Collection not found' });
  if (!roleAtLeast(row.role, min)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        min === 'owner'
          ? 'Only the owner can do that'
          : 'You can view this collection but not add to it',
    });
  }
  return { collection: row.collection, role: row.role };
}

/**
 * SQL condition: the story row `storyIdColumn` belongs to a collection where
 * `userId` has at least `min` role.
 */
export function storyInCollectionWithRole(
  db: Db,
  userId: string,
  storyIdColumn: SQL | typeof stories.id,
  min: MemberRole = 'viewer',
) {
  const allowed = (Object.keys(ROLE_RANK) as MemberRole[]).filter((r) => roleAtLeast(r, min));
  return exists(
    db
      .select({ one: sql`1` })
      .from(collectionStories)
      .innerJoin(
        collectionMembers,
        and(
          eq(collectionMembers.collectionId, collectionStories.collectionId),
          eq(collectionMembers.userId, userId),
        ),
      )
      .where(
        and(
          eq(collectionStories.storyId, storyIdColumn),
          allowed.length === 3
            ? undefined
            : or(...allowed.map((role) => eq(collectionMembers.role, role))),
        ),
      ),
  );
}

/** SQL condition: the viewer can read the story in the current row of `stories`. */
export function canReadStoryCondition(db: Db, userId: string) {
  return or(eq(stories.authorId, userId), storyInCollectionWithRole(db, userId, stories.id))!;
}

export async function requireStoryRead(db: Db, userId: string, storyId: string) {
  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), canReadStoryCondition(db, userId)))
    .limit(1);
  if (!story) throw new TRPCError({ code: 'NOT_FOUND', message: 'Memory not found' });
  return story;
}

export async function requireStoryAuthor(db: Db, userId: string, storyId: string) {
  const story = await requireStoryRead(db, userId, storyId);
  if (story.authorId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the person who added this can change it',
    });
  }
  return story;
}

/** Author, or owner/contributor of a collection that contains the story. */
export async function requireStoryContributor(db: Db, userId: string, storyId: string) {
  const story = await requireStoryRead(db, userId, storyId);
  if (story.authorId === userId) return story;
  const [row] = await db
    .select({ id: stories.id })
    .from(stories)
    .where(
      and(
        eq(stories.id, storyId),
        storyInCollectionWithRole(db, userId, stories.id, 'contributor'),
      ),
    )
    .limit(1);
  if (!row)
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You can view this memory but not change it',
    });
  return story;
}

export async function getDefaultCollectionId(db: Db, userId: string): Promise<string> {
  const [row] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.ownerId, userId), eq(collections.isDefault, true)))
    .limit(1);
  if (!row) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Your Personal collection is missing',
    });
  }
  return row.id;
}
