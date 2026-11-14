/**
 * better-auth, created per database handle (D1 bindings and Hyperdrive
 * clients are per-request on Workers, so a module-level singleton can't work).
 *
 * - Email/password always; Google when GOOGLE_CLIENT_ID/SECRET are set.
 * - SIGNUP_MODE=invite (default): the first account on a fresh deployment is
 *   open; after that sign-up needs a valid invite (cookie set by /invite/[token]).
 *   SIGNUP_MODE=open: anyone can sign up (hosted mode).
 * - Email verification + password-reset mail only when Resend is configured.
 * - Every new user gets a private "Moments" collection.
 * - MCP clients (ChatGPT, Ri, …) connect with OAuth: dynamic client
 *   registration, PKCE, and an always-on consent screen (/oauth/consent).
 */
import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { mcp } from 'better-auth/plugins';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { isEmailConfigured, sendEmail, simpleEmailHtml } from '@/services/server/email';
import { getEnvVar } from '@/lib/server/cloudflare';
import { INVITE_COOKIE, readCookie, sha256Hex } from '@/lib/server/tokens';
import { type Db, getDb, runBatch } from '@/db';
import { getDatabaseProvider } from '@/db/provider';
import {
  accounts,
  collectionInvites,
  collectionMembers,
  collections,
  oauthAccessTokens,
  oauthApplications,
  oauthConsents,
  sessions,
  users,
  verifications,
} from '@/db/schema';

export type SignupMode = 'invite' | 'open';

export const LOGIN_PATH = '/login';
export const CONSENT_PATH = '/oauth/consent';
export const MCP_PATH = '/api/mcp';

export function getSignupMode(): SignupMode {
  return getEnvVar('SIGNUP_MODE') === 'open' ? 'open' : 'invite';
}

/** Is there a usable invite for this token? Used to gate sign-up. */
export async function findOpenInvite(db: Db, token: string) {
  const [invite] = await db
    .select()
    .from(collectionInvites)
    .where(
      and(
        eq(collectionInvites.tokenHash, await sha256Hex(token)),
        isNull(collectionInvites.acceptedAt),
        isNull(collectionInvites.revokedAt),
        gt(collectionInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invite ?? null;
}

export async function createMomentsCollection(db: Db, userId: string) {
  const id = uuidv7();
  await runBatch(db, (tx) => [
    tx.insert(collections).values({
      id,
      ownerId: userId,
      name: 'Personal',
      description: 'Just for you. Private notes and memories only you can see.',
      isDefault: true,
    }),
    tx.insert(collectionMembers).values({ collectionId: id, userId, role: 'owner' }),
  ]);
  return id;
}

export async function createFamilyCollection(db: Db, userId: string) {
  const id = uuidv7();
  await runBatch(db, (tx) => [
    tx.insert(collections).values({
      id,
      ownerId: userId,
      name: 'Our family',
      description: 'Everyday moments, stories, and voices we keep together.',
      isDefault: false,
    }),
    tx.insert(collectionMembers).values({ collectionId: id, userId, role: 'owner' }),
  ]);
  return id;
}

function createAuth(db: Db, baseURL: string | undefined) {
  const googleClientId = getEnvVar('GOOGLE_CLIENT_ID');
  const googleClientSecret = getEnvVar('GOOGLE_CLIENT_SECRET');
  const emailEnabled = isEmailConfigured();
  const signupMode = getSignupMode();

  return betterAuth({
    appName: 'Lore',
    baseURL,
    secret: getEnvVar('BETTER_AUTH_SECRET'),
    trustedOrigins: (getEnvVar('BETTER_AUTH_TRUSTED_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    database: drizzleAdapter(db, {
      provider: getDatabaseProvider() === 'postgres' ? 'pg' : 'sqlite',
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        oauthApplication: oauthApplications,
        oauthAccessToken: oauthAccessTokens,
        oauthConsent: oauthConsents,
      },
    }),
    plugins: [
      mcp({
        loginPage: LOGIN_PATH,
        // Protected-resource metadata advertises the origin, so both /mcp and
        // /api/mcp sit "under" it for clients that check (Ri does).
        oidcConfig: {
          loginPage: LOGIN_PATH,
          consentPage: CONSENT_PATH,
          requirePKCE: true,
          allowPlainCodeChallengeMethod: false,
          allowDynamicClientRegistration: true,
          accessTokenExpiresIn: 60 * 60,
          // Stay connected for 90 days of inactivity before re-approving.
          refreshTokenExpiresIn: 60 * 60 * 24 * 90,
        },
      }),
    ],
    advanced: { database: { generateId: () => uuidv7() } },
    session: {
      // Media requests check the session on every image/audio load; the signed
      // cookie cache keeps those from hitting the database.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // In invite mode the invite link is the proof; only hosted/open mode
      // needs to verify ownership of the address.
      requireEmailVerification: emailEnabled && signupMode === 'open',
      sendResetPassword: emailEnabled
        ? async ({ user, url }) => {
            await sendEmail({
              to: user.email,
              subject: 'Reset your Lore password',
              text: `Reset your password: ${url}`,
              html: simpleEmailHtml({
                heading: 'Reset your password',
                body: 'Someone (hopefully you) asked to reset your Lore password.',
                cta: 'Choose a new password',
                url,
              }),
            });
          }
        : undefined,
    },
    emailVerification: emailEnabled
      ? {
          sendOnSignUp: signupMode === 'open',
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => {
            await sendEmail({
              to: user.email,
              subject: 'Confirm your email for Lore',
              text: `Confirm your email: ${url}`,
              html: simpleEmailHtml({
                heading: 'Confirm your email',
                body: 'Tap the button to finish setting up Lore.',
                cta: 'Confirm email',
                url,
              }),
            });
          },
        }
      : undefined,
    socialProviders:
      googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : undefined,
    databaseHooks: {
      user: {
        create: {
          before: async (_user, context) => {
            if (signupMode === 'open') return;
            const [{ total }] = await db.select({ total: count() }).from(users);
            if (total === 0) return; // first account on a fresh deployment
            const token = readCookie(context?.headers?.get('cookie'), INVITE_COOKIE);
            if (token && (await findOpenInvite(db, token))) return;
            throw new APIError('FORBIDDEN', {
              message: 'Lore is invite-only here. Ask someone to send you an invite link.',
            });
          },
          after: async (user, context) => {
            await createMomentsCollection(db, user.id);
            const token = readCookie(context?.headers?.get('cookie'), INVITE_COOKIE);
            const invited = token ? await findOpenInvite(db, token) : null;
            if (!invited) {
              await createFamilyCollection(db, user.id);
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

const cache = new WeakMap<Db, Map<string, Auth>>();

/** The auth instance for this request's database. */
export function getAuth(request?: Request): Auth {
  const db = getDb();
  const baseURL =
    getEnvVar('BETTER_AUTH_URL') ?? (request ? new URL(request.url).origin : undefined);
  let byUrl = cache.get(db);
  if (!byUrl) {
    byUrl = new Map();
    cache.set(db, byUrl);
  }
  const key = baseURL ?? '';
  let auth = byUrl.get(key);
  if (!auth) {
    auth = createAuth(db, baseURL);
    byUrl.set(key, auth);
  }
  return auth;
}

export interface Viewer {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** The signed-in user for a request, or null. */
export async function getViewer(request: Request): Promise<Viewer | null> {
  const session = await getAuth(request).api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}
