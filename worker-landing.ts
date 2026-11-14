/**
 * Cloudflare Worker entry for the public landing page (`lore-site`).
 * Redirects apex/alternate hosts (e.g. `ourlore.ai`) to `CANONICAL_HOST`
 * (e.g. `www.ourlore.ai`) with a 301 permanent redirect, then delegates to the
 * OpenNext handler.
 */
// @ts-ignore — generated at build time
import { default as nextHandler } from './.open-next/worker.js';

interface Env {
  CANONICAL_HOST?: string;
  REDIRECT_HOSTS?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const canonical = env.CANONICAL_HOST?.trim().toLowerCase();
    const redirects = (env.REDIRECT_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    if (canonical && host !== canonical && redirects.includes(host)) {
      url.hostname = canonical;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    return nextHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
