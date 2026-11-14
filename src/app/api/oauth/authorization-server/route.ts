/** RFC 8414 authorization-server metadata, served at /.well-known/oauth-authorization-server. */
import { oAuthDiscoveryMetadata } from 'better-auth/plugins';
import { getAuth } from '@/lib/auth/server';

export function GET(request: Request) {
  return oAuthDiscoveryMetadata(getAuth(request))(request);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}
