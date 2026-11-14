/**
 * MCP endpoint (Streamable HTTP, stateless). Also served at /mcp.
 * Auth: OAuth access token from the better-auth MCP plugin. Unauthenticated
 * requests get 401 + a pointer to the protected-resource metadata, which is
 * how ChatGPT / Ri discover how to sign in.
 */
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { eq } from 'drizzle-orm';
import { getStorage } from '@/services/server/storage';
import { getAuth } from '@/lib/auth/server';
import { getEnvVar } from '@/lib/server/cloudflare';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { createLoreMcpServer } from '@/server/mcp/server';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function originOf(request: Request) {
  return getEnvVar('BETTER_AUTH_URL') ?? new URL(request.url).origin;
}

function unauthorized(request: Request, description = 'Sign in to Lore to use this') {
  const metadata = `${originOf(request)}/.well-known/oauth-protected-resource`;
  return withCors(
    Response.json(
      { jsonrpc: '2.0', error: { code: -32001, message: description }, id: null },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer resource_metadata="${metadata}", error="invalid_token", error_description="${description}"`,
        },
      },
    ),
  );
}

async function handle(request: Request) {
  if (!request.headers.get('authorization')?.toLowerCase().startsWith('bearer ')) {
    return unauthorized(request);
  }
  const token = await getAuth(request).api.getMcpSession({ headers: request.headers });
  if (!token?.userId) return unauthorized(request, 'Access token is invalid or expired');

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(eq(users.id, token.userId))
    .limit(1);
  if (!user) return unauthorized(request, 'Account not found');

  const server = createLoreMcpServer({
    db,
    viewer: { ...user, image: user.image ?? null },
    storage: getStorage(),
    origin: originOf(request),
  });
  // Stateless: a fresh server + transport per request; nothing to keep between calls.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return withCors(await transport.handleRequest(request));
  } finally {
    // Let the response finish before tearing down (JSON mode resolves synchronously).
    void transport.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
