/**
 * Access to Cloudflare bindings when we're running on Workers (or under
 * `next dev`, where `initOpenNextCloudflareForDev` proxies local bindings).
 * Returns `undefined` on a plain Node runtime (`next start`, Docker, Vercel).
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';

export function tryGetCloudflareContext() {
  try {
    return getCloudflareContext();
  } catch {
    return undefined;
  }
}

export function tryGetCloudflareEnv(): CloudflareEnv | undefined {
  return tryGetCloudflareContext()?.env;
}

/**
 * Read a config value. `process.env` first (Node, `next dev`, and on Workers
 * OpenNext copies vars/secrets into it), then the Cloudflare env object.
 * Empty strings count as unset.
 */
export function getEnvVar(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    const fromProcess = process.env[name];
    return fromProcess && fromProcess.length > 0 ? fromProcess : undefined;
  }
  const fromBinding = (tryGetCloudflareEnv() as Record<string, unknown> | undefined)?.[name];
  return typeof fromBinding === 'string' && fromBinding.length > 0 ? fromBinding : undefined;
}

/** Run work after the response is sent (Workers `waitUntil`; plain promise on Node). */
export function runInBackground(promise: Promise<unknown>) {
  const ctx = tryGetCloudflareContext()?.ctx;
  const guarded = promise.catch((error) => console.error('[background]', error));
  if (ctx) ctx.waitUntil(guarded);
}
