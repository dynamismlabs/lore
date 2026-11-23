# Self-hosting Lore on Cloudflare

`pnpm deploy:cloudflare` puts Lore on your own Cloudflare account. It is safe to run again: it's also how
you apply settings and updates.

## What it creates

| Resource                    | Name (default) | Notes                                                                                                                                                                  |
| --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker                      | `lore`         | Serves the app at `https://lore.<your-subdomain>.workers.dev`                                                                                                          |
| D1 database                 | `lore`         | All app data. Migrations are applied on every deploy.                                                                                                                  |
| R2 bucket                   | `lore-media`   | Photos, recordings and videos. Private: files are only served through the app after an access check. Deleted files go to `trash/` and are removed after 30 days.       |
| R2 bucket                   | `lore-backups` | Nightly full database dumps (03:17 UTC), kept 90 days. The script also attempts to lock them against deletion for their first 30 days; check deploy output to confirm. |
| Workers AI                  | n/a            | Transcription and moments when no Groq key is set. Uses Cloudflare's free daily allowance.                                                                             |
| Secret `BETTER_AUTH_SECRET` | n/a            | Generated on the first deploy and stored only as a Worker secret, so sessions survive redeploys.                                                                       |

The resource IDs are written to `wrangler.deploy.jsonc` (git-ignored), so your fork never commits account
IDs.

## Pick the account (if you have more than one)

Use an **account-owned API token**. It can only touch that one account, so this deploy can't
affect anything else you run on Cloudflare:

1. Dashboard → switch to the account → **Manage Account → Account API Tokens → Create Token → Custom token**.
2. Permissions: **Workers Scripts: Edit**, **D1: Edit**, **Workers R2 Storage: Edit**, **Account Settings: Read**
   (optional: **Workers Tail: Read** for logs).
3. Put it in `.env.cloudflare` (git-ignored):

   ```
   CLOUDFLARE_ACCOUNT_ID=<the account id, on the account's Overview page>
   CLOUDFLARE_API_TOKEN=<token>
   ```

Without these the script uses your `wrangler login` session, and stops if that session can reach several
accounts so you never deploy to the wrong one.

## Prerequisites

- Node 22+ and pnpm (`corepack enable`).
- A Cloudflare account with **R2 enabled**: open R2 once in the dashboard and add a payment method.
  Check [R2 pricing](https://developers.cloudflare.com/r2/pricing/) for current allowances and storage costs.
- Production builds use webpack to keep the Worker bundle small.

## Deploy

```bash
pnpm install
pnpm deploy:cloudflare            # or: pnpm deploy:cloudflare --dry-run
```

Open the printed URL and create the first account. That person is the first member of this Lore. After that,
new accounts need an invite link (`SIGNUP_MODE=invite`).

## Add a custom domain

The first deploy works at the printed `workers.dev` URL. Leave `BETTER_AUTH_URL` unset while using it.
To use your own domain, activate its zone in the same Cloudflare account, then set this in
`.env.cloudflare` and deploy again:

```dotenv
BETTER_AUTH_URL=https://memories.example.com
```

The deploy script adds the hostname to the generated config as a Custom Domain. Cloudflare manages
its DNS record and HTTPS certificate. Use an HTTPS origin with no path, credentials, query, or custom
port. A `workers.dev` URL does not create a Custom Domain. Do not add your domain to the shared
`wrangler.jsonc`.

API tokens need **Workers Routes: Edit** for the affected zone in addition to the account permissions
above. If using Google sign-in, update its callback to
`https://memories.example.com/api/auth/callback/google`. Reconnect AI assistants at
`https://memories.example.com/mcp`.

See [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## Settings (`.env.cloudflare`)

Copy `.env.cloudflare.example` to `.env.cloudflare`, fill in what you want, and run the deploy again. Keys
are uploaded as encrypted Worker secrets.

| Key                                                                         | Why                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY`                                                              | Faster, more reliable transcripts and moments (`whisper-large-v3-turbo`, `gpt-oss-120b`).   |
| `RESEND_API_KEY`, `EMAIL_FROM`                                              | Email invites and password resets. Without them, invites are links you send yourself.       |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                  | "Continue with Google". Redirect URI: `<your url>/api/auth/callback/google`.                |
| `BETTER_AUTH_URL`                                                           | HTTPS origin for your custom domain; the deploy script attaches its hostname automatically. |
| `SIGNUP_MODE`                                                               | `invite` (default) or `open`.                                                               |
| `LORE_WORKER_NAME`, `LORE_D1_NAME`, `LORE_R2_BUCKET`, `LORE_BACKUPS_BUCKET` | Rename the resources, for example to run two instances on one account.                      |

## Connect ChatGPT, Ri or another AI assistant (MCP)

Lore is an MCP server at `https://<your url>/mcp`. Assistants sign in with your Lore account through OAuth
and you approve each one on a consent screen. They can search, read, save memories and comment. They can't
delete anything. The URL is shown in **Settings → Use Lore from your AI assistant**, along with the list of
connected apps and a **Disconnect** button for each.

- **ChatGPT:** Settings → Apps → Advanced → turn on Developer mode, then **Create** an app with the URL above
  (authentication: OAuth).
- **Ri:** Settings → Plugins → MCP servers → **Add MCP server**, then paste the URL. Ri detects OAuth automatically.
- **Claude / other clients:** add a remote MCP server with the same URL.

## Backups and restore

Backups run automatically. There are three layers:

1. **D1 Time Travel:** Cloudflare keeps point-in-time restore for 7 days on the free plan and 30 days on
   Workers Paid.
   ```bash
   pnpm exec wrangler d1 time-travel info lore
   pnpm exec wrangler d1 time-travel restore lore --timestamp=<unix seconds>   # overwrites in place; prints an undo bookmark
   ```
2. **Nightly dumps:** `lore-backups/d1/<yyyy-mm>/lore-<timestamp>.sql.gz`, 90 days, locked for 30 when the bucket lock was configured successfully. To
   restore one into a fresh database:
   ```bash
   pnpm exec wrangler r2 object get lore-backups/d1/2026-11/lore-<…>.sql.gz --remote --file backup.sql.gz
   gunzip backup.sql.gz
   pnpm exec wrangler d1 create lore-restored
   pnpm exec wrangler d1 execute lore-restored --remote --file backup.sql
   ```
   Then set `LORE_D1_NAME=lore-restored` in `.env.cloudflare` and deploy.
3. **Media trash:** deleting a memory moves its files to `lore-media/trash/…` for 30 days. Copy one back with
   `wrangler r2 object get` / `put` if needed.

The Worker's logs show each backup: `[backup] wrote d1/… N tables, M rows`.

## Day-to-day

- **Update:** `git pull && pnpm install && pnpm deploy:cloudflare`
- **Logs:** `pnpm exec wrangler tail lore`
- **Extra off-Cloudflare copy:** `pnpm exec wrangler d1 export lore --remote --output lore-backup.sql`
- **Password resets:** configure Resend (above) before a member needs recovery. Other members cannot reset
  someone else's password.

## Remove everything

```bash
pnpm exec wrangler delete lore
pnpm exec wrangler d1 delete lore
pnpm exec wrangler r2 bucket delete lore-media     # the bucket must be empty first
pnpm exec wrangler r2 bucket delete lore-backups   # possible once the 30-day backup lock has passed
```

This deletes all memories. Export the database and download the bucket first if you want to keep them.
