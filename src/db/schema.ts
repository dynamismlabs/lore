/**
 * The table objects every router imports. Values come from whichever dialect
 * this deployment uses; the TYPES are always the SQLite definitions so the
 * query code is written once. `src/db/parity.test.ts` proves the two schemas
 * are structurally identical, which is what makes the cast below sound.
 *
 * Never import `./sqlite` or `./pg` directly from app code.
 */
import * as pg from './pg';
import { getDatabaseProvider } from './provider';
import * as sqlite from './sqlite';

type Schema = typeof sqlite;

const schema = (getDatabaseProvider() === 'postgres' ? pg : sqlite) as unknown as Schema;

export const {
  users,
  sessions,
  accounts,
  verifications,
  oauthApplications,
  oauthAccessTokens,
  oauthConsents,
  collections,
  collectionMembers,
  collectionInvites,
  stories,
  storyMedia,
  collectionStories,
  people,
  storyPeople,
  comments,
  reactions,
} = schema;

export { schema };
export type { Schema };
