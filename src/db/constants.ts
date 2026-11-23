/**
 * Enum-like values shared by both dialect schemas, the routers and the UI.
 * Stored as plain text columns so SQLite and Postgres behave identically.
 */
export const MEMBER_ROLES = ['owner', 'contributor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Roles an owner can hand out through an invite or a role change. */
export const INVITABLE_ROLES = ['contributor', 'viewer'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const MEDIA_KINDS = ['text', 'audio', 'image', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Special memory formats. null = a regular memory. */
export const STORY_FORMATS = ['second'] as const;
export type StoryFormat = (typeof STORY_FORMATS)[number];

export const TRANSCRIPT_STATUSES = ['pending', 'done', 'failed', 'unavailable'] as const;
export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number];

/** How exactly a memory's date is known: "June 3, 2019", "June 2019", or just "2019". */
export const DATE_PRECISIONS = ['day', 'month', 'year'] as const;
export type DatePrecision = (typeof DATE_PRECISIONS)[number];

export const MOMENT_STATUSES = ['pending', 'accepted', 'dismissed'] as const;
export type MomentStatus = (typeof MOMENT_STATUSES)[number];

/** One timed line of a transcript (stored as JSON on `story_media`). */
export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

/** Someone a suggested moment mentions; `id` is set when they're already in People. */
export interface SuggestedPerson {
  id: string | null;
  name: string;
}
