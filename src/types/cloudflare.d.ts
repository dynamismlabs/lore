// Optional bindings that aren't in the default wrangler.jsonc.
interface CloudflareEnv {
  /** Postgres via Hyperdrive (DATABASE_PROVIDER=postgres on Workers). */
  HYPERDRIVE?: Hyperdrive;
}
