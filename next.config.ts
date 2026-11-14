import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // A deployment is either D1 or Postgres; inline the choice so module-level
  // table selection (src/db/schema.ts) is fixed at build time.
  env: {
    DATABASE_PROVIDER: process.env.DATABASE_PROVIDER || 'd1',
    NEXT_PUBLIC_LANDING_ONLY: process.env.NEXT_PUBLIC_LANDING_ONLY || '',
  },
  images: { unoptimized: true },
  poweredByHeader: false,
  agentRules: false,
  // OAuth discovery for MCP clients (ChatGPT, Ri, …) lives under better-auth.
  async redirects() {
    // One second a day graduated from Labs to Vibes.
    return [{ source: '/labs/seconds', destination: '/vibes', permanent: true }];
  },
  async rewrites() {
    const metadata = '/api/oauth/authorization-server';
    const resource = '/api/oauth/protected-resource';
    return [
      // Friendly MCP URL: https://<your lore>/mcp
      { source: '/mcp', destination: '/api/mcp' },
      { source: '/.well-known/oauth-authorization-server', destination: metadata },
      { source: '/.well-known/oauth-authorization-server/:path*', destination: metadata },
      { source: '/.well-known/openid-configuration', destination: metadata },
      { source: '/.well-known/oauth-protected-resource', destination: resource },
      { source: '/.well-known/oauth-protected-resource/:path*', destination: resource },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

// Local dev: expose the Cloudflare bindings from wrangler.jsonc (local D1 + R2)
// to `next dev` via getCloudflareContext(). Remote bindings (Workers AI) stay
// off so dev works without a Cloudflare login; set LORE_DEV_REMOTE_BINDINGS=1
// to try Workers AI transcription locally.
if (process.env.NODE_ENV === 'development') {
  import('@opennextjs/cloudflare').then(({ initOpenNextCloudflareForDev }) =>
    initOpenNextCloudflareForDev({ remoteBindings: process.env.LORE_DEV_REMOTE_BINDINGS === '1' }),
  );
}
