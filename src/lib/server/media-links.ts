/**
 * Short-lived links to one photo, recording or video, for MCP views. A view
 * runs in the assistant's sandboxed frame without Lore's sign-in cookie, so
 * `/api/media/[id]` can't check who is asking. Instead the MCP tool, which
 * already checked that the signed-in person can read the memory, hands out a
 * link signed for that one file that stops working after about an hour.
 * Anyone holding the link can open that file until then, like a presigned URL.
 */
import { getEnvVar } from '@/lib/server/cloudflare';
import { mediaUrl } from '@/server/trpc/stories/hydrate';

/** Links last 60–70 minutes. Expiry is rounded up to 10 minutes so repeat renders reuse the browser cache. */
const LIFETIME_MS = 60 * 60 * 1000;
const ROUND_MS = 10 * 60 * 1000;
const PURPOSE = 'lore media link v1';

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(key: BufferSource, message: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

/** A key only for media links, derived from the auth secret. Null in production without one. */
async function linkKey(): Promise<ArrayBuffer | null> {
  const secret = getEnvVar('BETTER_AUTH_SECRET');
  if (!secret && process.env.NODE_ENV === 'production') return null;
  return hmac(encoder.encode(secret ?? 'lore-development-media-links'), PURPOSE);
}

async function signature(key: ArrayBuffer, mediaId: string, expires: number) {
  return base64url(await hmac(key, `${mediaId}.${expires}`));
}

/** Returns a signer for one request, or null when links can't be signed (no secret in production). */
export async function mediaLinkSigner(origin: string, now = Date.now()) {
  const key = await linkKey();
  if (!key) return null;
  const expires = Math.ceil((now + LIFETIME_MS) / ROUND_MS) * ROUND_MS;
  return async (mediaId: string) =>
    `${origin}${mediaUrl(mediaId)}?exp=${expires}&sig=${await signature(key, mediaId, expires)}`;
}

export type MediaLinkSigner = NonNullable<Awaited<ReturnType<typeof mediaLinkSigner>>>;

/** Whether `exp`/`sig` from a link are valid for this file right now. Returns the expiry if so. */
export async function verifyMediaLink(
  mediaId: string,
  exp: string | null,
  sig: string | null,
  now = Date.now(),
): Promise<number | null> {
  if (!exp || !sig || !/^\d{1,15}$/.test(exp)) return null;
  const expires = Number(exp);
  if (expires <= now || expires > now + LIFETIME_MS + ROUND_MS) return null;
  const key = await linkKey();
  if (!key) return null;
  const expected = await signature(key, mediaId, expires);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? expires : null;
}
