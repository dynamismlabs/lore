/**
 * One-command self-hosting on Cloudflare: `pnpm deploy:cloudflare`
 *
 * 1. Uses the Cloudflare account you pin in .env.cloudflare (CLOUDFLARE_ACCOUNT_ID
 *    + an account-scoped CLOUDFLARE_API_TOKEN), or logs you in.
 * 2. Creates — or reuses — a D1 database, a private media bucket and a private
 *    backups bucket, with retention rules (30-day media trash, 90-day backups,
 *    backups locked against deletion for 30 days).
 * 3. Writes their IDs to a git-ignored wrangler.deploy.jsonc (forks never commit account IDs).
 * 4. Applies database migrations.
 * 5. Builds with OpenNext and deploys the Worker (with a nightly backup cron).
 * 6. Generates BETTER_AUTH_SECRET on the first deploy and uploads any optional
 *    keys from .env.cloudflare (Groq, Resend, Google) as Worker secrets.
 *
 * Safe to re-run: it's also how you update after `git pull`.
 * `pnpm deploy:cloudflare --dry-run` builds and validates without touching your account.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const BASE_CONFIG = path.join(ROOT, 'wrangler.jsonc');
const DEPLOY_CONFIG = path.join(ROOT, 'wrangler.deploy.jsonc');
const ENV_FILE = path.join(ROOT, '.env.cloudflare');
const DRY_RUN = process.argv.includes('--dry-run');

/** Keys from .env.cloudflare that are uploaded as encrypted Worker secrets. */
const SECRET_KEYS = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'GROQ_API_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];

// ---------- helpers ----------

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

/** Strip // and /* *\/ comments (outside strings) so JSONC parses as JSON. */
function parseJsonc(text: string) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === '\\') out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/** Cloudflare credentials from .env.cloudflare, passed to every wrangler call. */
const cloudflareEnv: Record<string, string> = {};

interface RunOptions {
  env?: Record<string, string>;
  /** Return stdout instead of streaming it. */
  capture?: boolean;
}

function wrangler(args: string[], { env, capture }: RunOptions = {}) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: ROOT,
    env: { ...process.env, ...cloudflareEnv, ...env },
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
  });
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Run a command, streaming its output while also capturing it. */
function runTee(command: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...cloudflareEnv, ...env },
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

// ---------- keep local env files out of the bundle ----------

/**
 * OpenNext bakes `.env`, `.env.local`, `.env.production(.local)` … into the
 * Worker (`.open-next/cloudflare/next-env.mjs`). Your personal dev keys must
 * never ship, so they're moved aside for the build and always put back.
 * Production config comes only from Worker vars/secrets.
 */
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
  restoreEnvFiles(); // heal a previous run that was killed mid-build
  const hidden = readdirSync(ROOT).filter((name) => BUNDLED_ENV_FILE.test(name));
  for (const name of hidden)
    renameSync(path.join(ROOT, name), path.join(ROOT, name + HIDDEN_SUFFIX));
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

/** Refuse to ship a bundle that still carries env-file values. */
function assertNoBundledEnv() {
  const file = path.join(ROOT, '.open-next/cloudflare/next-env.mjs');
  if (!existsSync(file)) return;
  const leaked = [...readFileSync(file, 'utf8').matchAll(/"([A-Z][A-Z0-9_]*)":/g)].map((m) => m[1]);
  if (leaked.length) {
    fail(
      `The build still contains values from local .env files (${[...new Set(leaked)].join(', ')}). Not deploying.`,
    );
  }
}

// ---------- main ----------

interface Names {
  workerName: string;
  databaseName: string;
  bucketName: string;
  backupsBucketName: string;
  signupMode: 'invite' | 'open';
  accountId: string | undefined;
  customDomain: string | undefined;
}

/** Only an explicitly configured HTTPS origin can attach a custom domain. */
function getCustomDomain(authUrl: string | undefined): string | undefined {
  if (!authUrl) return undefined;
  const url = new URL(authUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('BETTER_AUTH_URL must be an HTTPS origin, e.g. https://memories.example.com.');
  }
  const hostname = url.hostname.replace(/\.$/, '');
  return hostname === 'workers.dev' || hostname.endsWith('.workers.dev') ? undefined : hostname;
}

async function main() {
  const settings = parseDotenv(ENV_FILE);
  const workerName = settings.LORE_WORKER_NAME || 'lore';
  const names: Names = {
    workerName,
    databaseName: settings.LORE_D1_NAME || workerName,
    bucketName: settings.LORE_R2_BUCKET || `${workerName}-media`,
    backupsBucketName: settings.LORE_BACKUPS_BUCKET || `${workerName}-backups`,
    signupMode: settings.SIGNUP_MODE === 'open' ? 'open' : 'invite',
    accountId: settings.CLOUDFLARE_ACCOUNT_ID,
    customDomain: getCustomDomain(settings.BETTER_AUTH_URL),
  };
  if (names.accountId) cloudflareEnv.CLOUDFLARE_ACCOUNT_ID = names.accountId;
  if (settings.CLOUDFLARE_API_TOKEN)
    cloudflareEnv.CLOUDFLARE_API_TOKEN = settings.CLOUDFLARE_API_TOKEN;

  console.log(bold('Deploying Lore to Cloudflare'));
  console.log(
    dim(
      `Account ${names.accountId ?? '(default)'} · Worker "${workerName}" · D1 "${names.databaseName}" · ` +
        `R2 "${names.bucketName}" + "${names.backupsBucketName}" · sign-up: ${names.signupMode}`,
    ),
  );
  if (DRY_RUN) console.log(dim('Dry run: no Cloudflare resources will be created or changed.'));

  const databaseId = DRY_RUN ? '00000000-0000-0000-0000-000000000000' : provision(names);
  writeDeployConfig(names, databaseId);

  if (!DRY_RUN) {
    step('Database migrations');
    const migrate = wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '-c', DEPLOY_CONFIG], {
      env: { CI: '1' },
    });
    if (!migrate.ok) fail('Migrations failed (see above).');
  }

  step('Build');
  const build = await withoutLocalEnvFiles(() =>
    runTee('pnpm', ['exec', 'opennextjs-cloudflare', 'build', '-c', DEPLOY_CONFIG], {
      DATABASE_PROVIDER: 'd1',
      NEXT_TELEMETRY_DISABLED: '1',
    }),
  );
  if (!build.ok) fail('Build failed (see above).');
  assertNoBundledEnv();

  if (DRY_RUN) {
    step('Validate (wrangler deploy --dry-run)');
    const dry = await runTee('pnpm', [
      'exec',
      'wrangler',
      'deploy',
      '--dry-run',
      '-c',
      DEPLOY_CONFIG,
    ]);
    if (!dry.ok) fail('Validation failed (see above).');
    console.log(`\n${bold('✓ Dry run passed.')} Run without --dry-run to deploy.`);
    return;
  }

  step('Deploy');
  const deploy = await withoutLocalEnvFiles(() =>
    runTee('pnpm', ['exec', 'opennextjs-cloudflare', 'deploy', '-c', DEPLOY_CONFIG]),
  );
  if (!deploy.ok) {
    if (/workers\.dev subdomain|register a workers\.dev/i.test(deploy.output)) {
      fail(
        'This account has no workers.dev subdomain yet. Open Workers & Pages in the Cloudflare dashboard once ' +
          '(it asks you to pick one), then run this again.',
      );
    }
    fail('Deploy failed (see above).');
  }
  const url = settings.BETTER_AUTH_URL
    ? new URL(settings.BETTER_AUTH_URL).origin
    : deploy.output.match(/https:\/\/[^\s]+\.workers\.dev/)?.[0];

  const existingSecrets = uploadSecrets(workerName, settings);
  printNextSteps({ url, names, settings, existingSecrets });
}

function provision(names: Names): string {
  step('Cloudflare account');
  let whoami = wrangler(['whoami', '--json'], { capture: true });
  if (!whoami.ok && cloudflareEnv.CLOUDFLARE_API_TOKEN) {
    fail(
      `CLOUDFLARE_API_TOKEN in .env.cloudflare was rejected:\n${whoami.stderr || whoami.stdout}`,
    );
  }
  if (!whoami.ok) {
    console.log('Opening the browser to log into Cloudflare…');
    if (!wrangler(['login']).ok) fail('Cloudflare login failed.');
    whoami = wrangler(['whoami', '--json'], { capture: true });
    if (!whoami.ok) fail('Still not logged in. Run `pnpm exec wrangler login` and try again.');
  }
  let info: { email?: string; accounts?: { id: string; name: string }[] } = {};
  try {
    info = JSON.parse(whoami.stdout);
  } catch {
    // Older wrangler output; fall through with what we know.
  }
  const accounts = info.accounts ?? [];
  const account = names.accountId ? accounts.find((a) => a.id === names.accountId) : accounts[0];
  if (names.accountId && accounts.length && !account) {
    fail(
      `These credentials can't reach account ${names.accountId}. Check CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN.`,
    );
  }
  if (!names.accountId && accounts.length > 1) {
    fail(
      `You can reach ${accounts.length} Cloudflare accounts. Pick one with CLOUDFLARE_ACCOUNT_ID in .env.cloudflare:\n` +
        accounts.map((a) => `  ${a.id}  ${a.name}`).join('\n'),
    );
  }
  console.log(
    `Using ${account ? `"${account.name}" (${account.id})` : `account ${names.accountId ?? '(default)'}`}` +
      (info.email ? ` as ${info.email}` : ''),
  );

  step('Database (D1)');
  const list = wrangler(['d1', 'list', '--json'], { capture: true });
  if (!list.ok) fail(`Couldn't list D1 databases:\n${list.stderr}`);
  let database = (JSON.parse(list.stdout) as { uuid: string; name: string }[]).find(
    (db) => db.name === names.databaseName,
  );
  if (database) {
    console.log(`Using existing database "${names.databaseName}"`);
  } else {
    console.log(`Creating database "${names.databaseName}"…`);
    const created = wrangler(['d1', 'create', names.databaseName], { capture: true });
    if (!created.ok) fail(`Couldn't create the database:\n${created.stderr || created.stdout}`);
    const info = wrangler(['d1', 'info', names.databaseName, '--json'], { capture: true });
    const uuid = info.ok ? (JSON.parse(info.stdout).uuid as string | undefined) : undefined;
    const fromOutput = created.stdout.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    )?.[0];
    const id = uuid ?? fromOutput;
    if (!id) fail('Created the database but could not read its ID. Re-run this command.');
    database = { uuid: id!, name: names.databaseName };
  }

  step('Private storage (R2)');
  const buckets = wrangler(['r2', 'bucket', 'list'], { capture: true });
  if (!buckets.ok) {
    fail(
      `Couldn't reach R2. If you haven't used R2 on this account, enable it once in the dashboard ` +
        `(R2 → "Enable") — it has a free tier but needs a payment method on file.\n\n${buckets.stderr}`,
    );
  }
  const existing = [...buckets.stdout.matchAll(/^name:\s+(\S+)/gm)].map((m) => m[1]);
  for (const name of [names.bucketName, names.backupsBucketName]) {
    if (existing.includes(name)) {
      console.log(`Using existing bucket "${name}"`);
    } else {
      console.log(`Creating bucket "${name}" (private — nothing in it is ever public)…`);
      const created = wrangler(['r2', 'bucket', 'create', name], { capture: true });
      if (!created.ok) fail(`Couldn't create the bucket:\n${created.stderr || created.stdout}`);
    }
  }

  step('Backups & retention');
  ensureLifecycle(
    names.bucketName,
    'trash-30-days',
    'trash/',
    30,
    'Deleted photos and recordings stay recoverable for 30 days',
  );
  ensureLifecycle(
    names.backupsBucketName,
    'backups-90-days',
    '',
    90,
    'Nightly database backups kept for 90 days',
  );
  ensureLock(names.backupsBucketName, 'backups-locked-30-days', 30);
  console.log(
    '✓ D1 Time Travel: automatic point-in-time restore (7 days free, 30 days on Workers Paid)',
  );

  return database!.uuid;
}

function ensureLifecycle(bucket: string, name: string, prefix: string, days: number, note: string) {
  const list = wrangler(['r2', 'bucket', 'lifecycle', 'list', bucket], { capture: true });
  if (list.ok && list.stdout.includes(name)) {
    console.log(`✓ ${note}`);
    return;
  }
  const args = ['r2', 'bucket', 'lifecycle', 'add', bucket, name];
  if (prefix) args.push(prefix);
  const added = wrangler([...args, '--expire-days', String(days), '--force'], { capture: true });
  if (!added.ok)
    fail(`Couldn't add lifecycle rule "${name}" to ${bucket}:\n${added.stderr || added.stdout}`);
  console.log(`✓ ${note}`);
}

/** Backups can't be deleted — even with a leaked token — until they're this old. */
function ensureLock(bucket: string, name: string, days: number) {
  const note = `✓ Backups locked against deletion for their first ${days} days`;
  const list = wrangler(['r2', 'bucket', 'lock', 'list', bucket], { capture: true });
  if (list.ok && list.stdout.includes(name)) {
    console.log(note);
    return;
  }
  const added = wrangler(
    ['r2', 'bucket', 'lock', 'add', bucket, name, '', '--retention-days', String(days), '--force'],
    { capture: true },
  );
  if (!added.ok) {
    const reason = (added.stderr || added.stdout).trim().split('\n').pop();
    console.log(dim(`(Skipped the backup lock: ${reason})`));
    return;
  }
  console.log(note);
}

function writeDeployConfig(names: Names, databaseId: string) {
  step('Deploy config');
  const config = parseJsonc(readFileSync(BASE_CONFIG, 'utf8'));
  config.name = names.workerName;
  config.routes = names.customDomain ? [{ pattern: names.customDomain, custom_domain: true }] : [];
  if (names.accountId) config.account_id = names.accountId;
  config.services = [{ binding: 'WORKER_SELF_REFERENCE', service: names.workerName }];
  config.d1_databases = [
    { ...config.d1_databases[0], database_name: names.databaseName, database_id: databaseId },
  ];
  config.r2_buckets = [
    { binding: 'MEDIA', bucket_name: names.bucketName },
    { binding: 'BACKUPS', bucket_name: names.backupsBucketName },
  ];
  config.vars = { ...(config.vars ?? {}), SIGNUP_MODE: names.signupMode };
  writeFileSync(
    DEPLOY_CONFIG,
    `// Generated by \`pnpm deploy:cloudflare\` from wrangler.jsonc. Do not commit.\n${JSON.stringify(config, null, 2)}\n`,
  );
  console.log(`Wrote ${path.basename(DEPLOY_CONFIG)}`);
}

function uploadSecrets(workerName: string, settings: Record<string, string>) {
  step('Secrets');
  const listed = wrangler(['secret', 'list', '--name', workerName, '--format', 'json'], {
    capture: true,
  });
  const existingSecrets = new Set<string>(
    listed.ok ? (JSON.parse(listed.stdout) as { name: string }[]).map((s) => s.name) : [],
  );
  const secrets: Record<string, string> = {};
  for (const key of SECRET_KEYS) if (settings[key]) secrets[key] = settings[key];
  if (!existingSecrets.has('BETTER_AUTH_SECRET') && !secrets.BETTER_AUTH_SECRET) {
    // Generated once and stored only in Cloudflare; later deploys keep it, so sessions survive.
    secrets.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
    console.log('Generated a session secret (stored only as a Worker secret).');
  }
  if (Object.keys(secrets).length) {
    const dir = mkdtempSync(path.join(tmpdir(), 'lore-secrets-'));
    const file = path.join(dir, 'secrets.json');
    writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
    const bulk = wrangler(['secret', 'bulk', file, '--name', workerName], { capture: true });
    rmSync(dir, { recursive: true, force: true });
    if (!bulk.ok) fail(`Couldn't upload secrets:\n${bulk.stderr || bulk.stdout}`);
    console.log(`Uploaded: ${Object.keys(secrets).join(', ')}`);
  } else {
    console.log('Nothing new to upload.');
  }
  for (const key of Object.keys(secrets)) existingSecrets.add(key);
  return existingSecrets;
}

function printNextSteps({
  url,
  names,
  settings,
  existingSecrets,
}: {
  url: string | undefined;
  names: Names;
  settings: Record<string, string>;
  existingSecrets: Set<string>;
}) {
  const has = (key: string) => !!settings[key] || existingSecrets.has(key);
  const transcription = has('GROQ_API_KEY')
    ? 'Groq Whisper'
    : 'Cloudflare Workers AI (free daily allowance; add GROQ_API_KEY for faster, sturdier transcripts)';
  console.log(`\n${bold('✓ Lore is live')}${url ? `: ${url}` : ''}`);
  console.log(
    [
      '',
      `  • Open it and create the first account — after that, sign-up is ${names.signupMode === 'invite' ? 'invite-only' : 'open to anyone'}.`,
      '  • Make a collection and tap Invite to bring your family in.',
      `  • Connect ChatGPT or Ri: MCP server URL ${url ? `${url}/mcp` : '<your url>/mcp'} (Settings → "Use Lore from your AI assistant").`,
      `  • Transcription: ${transcription}.`,
      `  • Email: ${has('RESEND_API_KEY') ? 'Resend' : 'off — invites are shared as links'}.`,
      `  • Backups: nightly to "${names.backupsBucketName}" (90 days) + D1 Time Travel. See docs/deploy-cloudflare.md to restore.`,
      `  • Update later with \`git pull && pnpm deploy:cloudflare\`. Logs: \`pnpm exec wrangler tail ${names.workerName}\`.`,
      '',
    ].join('\n'),
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
