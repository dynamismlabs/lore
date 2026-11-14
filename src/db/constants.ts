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
