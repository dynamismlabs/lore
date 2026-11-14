import { getAuth } from '@/lib/auth/server';

/**
 * better-auth handler, with two adjustments for MCP OAuth:
 *
 * 1. Every authorization asks for consent. Clients register themselves, so
 *    without this any site could silently get a token for a signed-in user.
 * 2. Sign-in/sign-up never resume an OAuth flow inside the fetch request (the
 *    plugin's cookie hook would answer the XHR with a redirect). The login
 *    page resumes it with a normal navigation instead.
 */
function prepare(request: Request): Request {
  const url = new URL(request.url);

  if (url.pathname.endsWith('/mcp/authorize')) {
    const prompt = new Set((url.searchParams.get('prompt') ?? '').split(' ').filter(Boolean));
    if (!prompt.has('consent')) {
      prompt.add('consent');
      url.searchParams.set('prompt', [...prompt].join(' '));
      return new Request(url.toString(), { method: request.method, headers: request.headers });
    }
  }

  if (/\/sign-(in|up)\//.test(url.pathname)) {
    const cookie = request.headers.get('cookie');
    if (cookie?.includes('oidc_login_prompt')) {
      const headers = new Headers(request.headers);
      headers.set(
        'cookie',
        cookie
          .split(';')
          .filter(
            (part) =>
              !part.trim().startsWith('oidc_login_prompt') && !part.includes('.oidc_login_prompt'),
          )
          .join(';'),
      );
      // Rebuild from parts: Next's request subclass can't be passed to new Request().
      return new Request(request.url, {
        method: request.method,
        headers,
        body: request.body,
        // @ts-expect-error — required by Node's fetch for streaming bodies; ignored elsewhere.
        duplex: 'half',
      });
    }
  }

  return request;
}

const handler = (request: Request) => {
  const prepared = prepare(request);
  return getAuth(prepared).handler(prepared);
};

export { handler as GET, handler as POST };
