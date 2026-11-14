/**
 * Deploy the public open-source marketing/landing page as its own standalone
 * Cloudflare Worker (`pnpm deploy:landing`), completely separate from your
 * self-hosted Lore app Worker (`pnpm deploy:cloudflare`).
 *
 * - Reads `.env.cloudflare.dynamism` by default if present (or `--env-file <file>`,
 *   falling back to `.env.cloudflare`).
 * - Default Worker name: `lore-site` (override with `LORE_LANDING_WORKER_NAME`) so
 *   it can never overwrite a `lore` app Worker even on the same account.
 * - Optional custom domain: `LORE_LANDING_DOMAIN`
 * - Builds with `NEXT_PUBLIC_LANDING_ONLY=1` so `/` serves `<LandingScreen />`
 *   directly and touches zero D1 databases, R2 buckets, or cron jobs.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'node_modules', '.bin');
const LANDING_CONFIG = path.join(ROOT, 'wrangler.landing.jsonc');
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_BUILD = process.argv.includes('--skip-build');

function resolveEnvFile(): string {
  const flagIndex = process.argv.findIndex((arg) => arg === '--env-file');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(ROOT, process.argv[flagIndex + 1]);
  }
  const eqArg = process.argv.find((arg) => arg.startsWith('--env-file='));
  if (eqArg) {
    return path.resolve(ROOT, eqArg.slice('--env-file='.length));
  }
  const dynamismFile = path.join(ROOT, '.env.cloudflare.dynamism');
  if (existsSync(dynamismFile)) return dynamismFile;
  return path.join(ROOT, '.env.cloudflare');
}

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
let stepNumber = 0;
const step = (title: string) => console.log(`\n${bold(`${++stepNumber}. ${title}`)}`);
const fail = (message: string): never => {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
};

function parseDotenv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) out[key] = value;
  }
  return out;
}

const BUNDLED_ENV_FILE = /^\.env(\.(local|production|development|test)(\.local)?)?$/;
const HIDDEN_SUFFIX = '.lore-deploy-hidden';

function restoreEnvFiles() {
  for (const name of readdirSync(ROOT)) {
    if (name.endsWith(HIDDEN_SUFFIX)) {
      renameSync(path.join(ROOT, name), path.join(ROOT, name.slice(0, -HIDDEN_SUFFIX.length)));
    }
  }
}

async function withoutLocalEnvFiles<T>(fn: () => Promise<T>): Promise<T> {
  restoreEnvFiles();
  const hidden = readdirSync(ROOT).filter((name) => BUNDLED_ENV_FILE.test(name));
  for (const name of hidden) {
    renameSync(path.join(ROOT, name), path.join(ROOT, name + HIDDEN_SUFFIX));
  }
  if (hidden.length) console.log(dim(`Keeping ${hidden.join(', ')} out of the build`));
  const onSignal = () => {
    restoreEnvFiles();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    return await fn();
  } finally {
    restoreEnvFiles();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

function runTee(command: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        PATH: `${BIN}:${process.env.PATH ?? ''}`,
        ...env,
      },
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
      process.stderr.write(chunk);
    });
    child.on('close', (code) => resolve({ ok: code === 0, output }));
  });
}

async function main() {
  const envFile = resolveEnvFile();
  const settings = parseDotenv(envFile);
  const workerName = settings.LORE_LANDING_WORKER_NAME || 'lore-site';
  const customDomain = settings.LORE_LANDING_DOMAIN?.trim();
  // If LORE_LANDING_DOMAIN is "www.ourlore.ai", automatically redirect "ourlore.ai" -> "www.ourlore.ai"
  // (or use explicit LORE_LANDING_REDIRECT_FROM).
  const redirectFrom =
    settings.LORE_LANDING_REDIRECT_FROM?.trim() ??
    (customDomain?.startsWith('www.') ? customDomain.slice(4) : undefined);
  const routes = [
    ...(customDomain ? [{ pattern: customDomain, custom_domain: true }] : []),
    ...(redirectFrom
      ? redirectFrom
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((pattern) => ({ pattern, custom_domain: true }))
      : []),
  ];
  const cfEnv: Record<string, string> = {};
  if (settings.CLOUDFLARE_ACCOUNT_ID) cfEnv.CLOUDFLARE_ACCOUNT_ID = settings.CLOUDFLARE_ACCOUNT_ID;
  if (settings.CLOUDFLARE_API_TOKEN) cfEnv.CLOUDFLARE_API_TOKEN = settings.CLOUDFLARE_API_TOKEN;

  console.log(bold('Deploying Lore Public Landing Page to Cloudflare'));
  console.log(
    dim(
      `Env file: ${path.basename(envFile)} · Account ${settings.CLOUDFLARE_ACCOUNT_ID ?? '(default)'} · Worker "${workerName}"` +
        (customDomain ? ` · Domain "${customDomain}"` : '') +
        (redirectFrom ? ` (redirects from ${redirectFrom})` : '') +
        ' · No D1 / R2 required',
    ),
  );

  step('Landing Worker config');
  const config: Record<string, unknown> = {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: workerName,
    workers_dev: true,
    ...(settings.CLOUDFLARE_ACCOUNT_ID ? { account_id: settings.CLOUDFLARE_ACCOUNT_ID } : {}),
    ...(routes.length ? { routes } : {}),
    main: 'worker-landing.ts',
    compatibility_date: '2026-10-01',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    assets: {
      directory: '.open-next/assets',
      binding: 'ASSETS',
    },
    services: [{ binding: 'WORKER_SELF_REFERENCE', service: workerName }],
    vars: {
      NEXT_PUBLIC_LANDING_ONLY: '1',
      ...(customDomain ? { CANONICAL_HOST: customDomain } : {}),
      ...(redirectFrom ? { REDIRECT_HOSTS: redirectFrom } : {}),
    },
    observability: { enabled: true },
  };

  writeFileSync(
    LANDING_CONFIG,
    `// Generated by \`pnpm deploy:landing\`. Do not commit.\n${JSON.stringify(config, null, 2)}\n`,
  );
  console.log(`Wrote ${path.basename(LANDING_CONFIG)}`);

  if (!SKIP_BUILD) {
    step('Build (NEXT_PUBLIC_LANDING_ONLY=1)');
    const build = await withoutLocalEnvFiles(() =>
      runTee(path.join(BIN, 'opennextjs-cloudflare'), ['build', '-c', LANDING_CONFIG], {
        ...cfEnv,
        NEXT_PUBLIC_LANDING_ONLY: '1',
        DATABASE_PROVIDER: 'd1',
        NEXT_TELEMETRY_DISABLED: '1',
      }),
    );
    if (!build.ok) fail('Build failed (see above).');
  }

  if (DRY_RUN) {
    step('Validate (wrangler deploy --dry-run)');
    const dry = await runTee(
      path.join(BIN, 'wrangler'),
      ['deploy', '--dry-run', '-c', LANDING_CONFIG],
      cfEnv,
    );
    if (!dry.ok) fail('Validation failed (see above).');
    console.log(`\n${bold('✓ Landing page dry run passed.')} Run without --dry-run to deploy.`);
    return;
  }

  step('Deploy');
  const deploy = await withoutLocalEnvFiles(() =>
    runTee(path.join(BIN, 'opennextjs-cloudflare'), ['deploy', '-c', LANDING_CONFIG], cfEnv),
  );
  if (!deploy.ok) fail('Deploy failed (see above).');

  const url = deploy.output.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];
  console.log(`\n${bold('✓ Lore landing page is live')}${url ? `: ${url}` : ''}`);
  if (customDomain) console.log(`  • Custom domain: https://${customDomain}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
