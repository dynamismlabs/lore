/**
 * Lore's app tables (SQLite / D1) — the canonical schema. Mirrored in
 * `src/db/pg/app.ts`; `src/db/parity.test.ts` fails if they drift.
 *
 * Access model: a story is readable by its author and by every member of any
 * collection it belongs to. Sharing is collection membership — nothing else.
 */
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { users } from './auth';
import {
  DATE_PRECISIONS,
  MEDIA_KINDS,
  MEMBER_ROLES,
  MOMENT_STATUSES,
  STORY_FORMATS,
  type SuggestedPerson,
  TRANSCRIPT_STATUSES,
  type TranscriptSegment,
} from '../constants';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
/** JSON stored as text. Postgres uses jsonb; Drizzle returns the parsed value on both. */
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
const now = () => new Date();

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // The owner's private "Moments" collection: where captures land by default.
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(now),
  },
  (t) => [index('collections_owner_id_idx').on(t.ownerId)],
);

export const collectionMembers = sqliteTable(
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

export const collectionInvites = sqliteTable(
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

export const stories = sqliteTable(
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
    // 'month' / 'year': only that much is known; occurredAt is noon UTC on the first day.
    occurredPrecision: text('occurred_precision', { enum: DATE_PRECISIONS })
      .notNull()
      .default('day'),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('stories_author_id_idx').on(t.authorId),
    index('stories_occurred_at_idx').on(t.occurredAt),
  ],
);

export const storyMedia = sqliteTable(
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
    // When each line of the transcript was said, so moments can point into the audio.
    transcriptSegments: json<TranscriptSegment[]>('transcript_segments'),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('story_media_story_id_idx').on(t.storyId)],
);

export const collectionStories = sqliteTable(
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

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relationship: text('relationship'),
    // YYYY-MM-DD. A calendar date, not an instant, so it never shifts with time zones.
    birthDate: text('birth_date'),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
    updatedAt: timestamp('updated_at').notNull().$defaultFn(now),
  },
  (t) => [index('people_owner_id_idx').on(t.ownerId)],
);

export const storyPeople = sqliteTable(
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

export const comments = sqliteTable(
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

export const reactions = sqliteTable(
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

/**
 * A memory that plays a stretch of a recording from another memory — a moment
 * from a long conversation. Playback goes through the recording's own media
 * id, so it needs read access to the conversation; deleting the conversation
 * removes the clip and leaves the moment as text.
 */
export const storyClips = sqliteTable(
  'story_clips',
  {
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => storyMedia.id, { onDelete: 'cascade' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.storyId, t.mediaId, t.startMs] }),
    index('story_clips_media_id_idx').on(t.mediaId),
  ],
);

/** Moments a model found in a recording, waiting for the author to add or dismiss them. */
export const momentSuggestions = sqliteTable(
  'moment_suggestions',
  {
    id: text('id').primaryKey(),
    mediaId: text('media_id')
      .notNull()
      .references(() => storyMedia.id, { onDelete: 'cascade' }),
    title: text('title'),
    // Markdown.
    summary: text('summary').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    occurredPrecision: text('occurred_precision', { enum: DATE_PRECISIONS })
      .notNull()
      .default('day'),
    startMs: integer('start_ms'),
    endMs: integer('end_ms'),
    people: json<SuggestedPerson[]>('people').notNull().default([]),
    status: text('status', { enum: MOMENT_STATUSES }).notNull().default('pending'),
    // The memory made from it, once added.
    storyId: text('story_id').references(() => stories.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('moment_suggestions_media_id_idx').on(t.mediaId)],
);
