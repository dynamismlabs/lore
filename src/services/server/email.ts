/**
 * Outbound email through Resend's HTTP API (no SDK; works on Workers and Node).
 * Everything that sends email must work without it: callers check
 * `isEmailConfigured()` and fall back to showing a copyable link.
 */
import { getEnvVar } from '@/lib/server/cloudflare';

export function isEmailConfigured() {
  return !!getEnvVar('RESEND_API_KEY');
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const apiKey = getEnvVar('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  const from = getEnvVar('EMAIL_FROM') ?? 'Lore <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email send failed (${res.status}) ${detail.slice(0, 200)}`);
  }
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function simpleEmailHtml({
  heading,
  body,
  cta,
  url,
}: {
  heading: string;
  body: string;
  cta: string;
  url: string;
}) {
  return `<!doctype html><html><body style="margin:0;padding:32px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 12px">${escape(heading)}</h1>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#404040">${escape(body)}</p>
    <a href="${escape(url)}" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">${escape(cta)}</a>
    <p style="font-size:12px;color:#737373;margin:24px 0 0">Or paste this link into your browser:<br>${escape(url)}</p>
  </div></body></html>`;
}
