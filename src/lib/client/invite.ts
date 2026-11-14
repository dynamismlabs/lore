/**
 * Remember an invite token on this device so sign-up (email or Google, which
 * leaves the site and comes back) can prove it was invited.
 */
const INVITE_COOKIE = 'lore_invite';

export function setInviteCookie(token: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${INVITE_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
}
