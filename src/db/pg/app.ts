/**
 * Lore's app tables (Postgres mirror) — Postgres mirror of the canonical
 * `src/db/sqlite/app.ts`; `src/db/parity.test.ts` fails if they drift.
 *
 * Access model: a story is readable by its author and by every member of any
 * collection it belongs to. Sharing is collection membership — nothing else.
 */
import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp as pgTimestamp,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { MEDIA_KINDS, MEMBER_ROLES, STORY_FORMATS, TRANSCRIPT_STATUSES } from '../constants';

const timestamp = (name: string) => pgTimestamp(name, { withTimezone: true, mode: 'date' });
const now = () => new Date();

export const collections = pgTable(
  'collections',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // The owner's private "Moments" collection: where captures land by default.
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(now),
  },
  (t) => [index('collections_owner_id_idx').on(t.ownerId)],
);

export const collectionMembers = pgTable(
  'collection_members',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: MEMBER_ROLES }).notNull(),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.userId] }),
    index('collection_members_user_id_idx').on(t.userId),
  ],
);

export const collectionInvites = pgTable(
  'collection_invites',
  {
    id: text('id').primaryKey(),
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    // SHA-256 of the token in the invite link; the raw token is never stored.
    tokenHash: text('token_hash').notNull(),
    role: text('role', { enum: MEMBER_ROLES }).notNull(),
    email: text('email'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedBy: text('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedAt: timestamp('accepted_at'),
    revokedAt: timestamp('revoked_at'),
  },
  (t) => [
    uniqueIndex('collection_invites_token_hash_idx').on(t.tokenHash),
    index('collection_invites_collection_id_idx').on(t.collectionId),
  ],
);

export const stories = pgTable(
  'stories',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    // 'second' = a vibe, a short daily clip (kept out of the regular feeds).
    format: text('format', { enum: STORY_FORMATS }),
    // When the memory happened (photo EXIF date, or when it was captured).
    occurredAt: timestamp('occurred_at').notNull().$defaultFn(now),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('stories_author_id_idx').on(t.authorId),
    index('stories_occurred_at_idx').on(t.occurredAt),
  ],
);

export const storyMedia = pgTable(
  'story_media',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MEDIA_KINDS }).notNull(),
    position: integer('position').notNull().default(0),
    // Object key in the private media bucket (audio/image/video only).
    storageKey: text('storage_key'),
    contentType: text('content_type'),
    sizeBytes: integer('size_bytes'),
    // Markdown for text, transcript for audio/video, caption for images.
    text: text('text'),
    transcriptStatus: text('transcript_status', { enum: TRANSCRIPT_STATUSES }),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('story_media_story_id_idx').on(t.storyId)],
);

export const collectionStories = pgTable(
  'collection_stories',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: timestamp('added_at').notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.storyId] }),
    index('collection_stories_story_id_idx').on(t.storyId),
  ],
);

export const people = pgTable(
  'people',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relationship: text('relationship'),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(now),
  },
  (t) => [index('people_owner_id_idx').on(t.ownerId)],
);

export const storyPeople = pgTable(
  'story_people',
  {
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    addedBy: text('added_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.personId] }),
    index('story_people_person_id_idx').on(t.personId),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(now),
  },
  (t) => [index('comments_story_id_idx').on(t.storyId)],
);

export const reactions = pgTable(
  'reactions',
  {
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.userId, t.emoji] })],
);
