/** RFC 9728 protected-resource metadata, served at /.well-known/oauth-protected-resource. */
import { oAuthProtectedResourceMetadata } from 'better-auth/plugins';
import { getAuth } from '@/lib/auth/server';

export function GET(request: Request) {
  return oAuthProtectedResourceMetadata(getAuth(request))(request);
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}
