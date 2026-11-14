/**
 * Self-hosting options for Lore:
 * 1. Cloudflare (One command, free-tier friendly)
 * 2. Local (Zero cloud accounts, Miniflare D1 + R2)
 * 3. Tailscale (Run on a Mac mini / home server & share privately on your family Tailnet)
 * 4. Node + Postgres + S3 (Full custom infrastructure)
 */
import { useState } from 'react';
import { Check, Cloud, Copy, Laptop, Network, Server, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type HostMode = 'cloudflare' | 'local' | 'tailscale' | 'postgres';

const CLOUDFLARE_COMMANDS = `git clone https://github.com/dynamismlabs/lore.git
cd lore
pnpm install
pnpm deploy:cloudflare`;

const LOCAL_COMMANDS = `git clone https://github.com/dynamismlabs/lore.git
cd lore
pnpm install
pnpm db:migrate:local
pnpm dev`;

const TAILSCALE_COMMANDS = `# 1. Start Lore on your home Mac mini, Raspberry Pi, or NAS
pnpm db:migrate:local
pnpm dev

# 2. Share privately on your family Tailnet with automatic HTTPS
tailscale serve --bg 3000
# -> Live at https://mac-mini.your-tailnet.ts.net`;

const POSTGRES_COMMANDS = `export DATABASE_PROVIDER=postgres
export DATABASE_URL="postgresql://user:pass@localhost:5432/lore"
pnpm db:migrate:pg
pnpm build && pnpm start`;

const OPTIONS: {
  id: HostMode;
  label: string;
  tag: string;
  icon: typeof Cloud;
}[] = [
  { id: 'cloudflare', label: 'Cloudflare', tag: 'One command', icon: Cloud },
  { id: 'local', label: 'Run Locally', tag: 'Zero accounts', icon: Laptop },
  { id: 'tailscale', label: 'Tailscale', tag: 'Home server', icon: Network },
  { id: 'postgres', label: 'Node + Postgres', tag: 'Any VPS / S3', icon: Server },
];

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border bg-neutral-950 text-neutral-100 shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <Terminal className="size-3.5 text-neutral-300" />
          <span className="font-mono text-[11px] text-neutral-200">{title}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 gap-1.5 rounded-lg px-2.5 text-xs text-neutral-300 hover:bg-white/10 hover:text-white"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-xs leading-relaxed text-neutral-100 sm:text-[13px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function HostingSection() {
  const [mode, setMode] = useState<HostMode>('cloudflare');

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div
        role="tablist"
        aria-label="Self-hosting options"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {OPTIONS.map(({ id, label, tag, icon: Icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(id)}
              className={cn(
                'flex flex-col items-start rounded-2xl border p-5 text-left transition-all',
                active
                  ? 'border-foreground bg-foreground text-background shadow-sm'
                  : 'bg-card hover:border-foreground/30',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <Icon className="size-4" />
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                    active ? 'bg-background/20 text-background' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {tag}
                </span>
              </div>
              <span className="mt-3.5 font-serif text-xl font-medium">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-3xl border bg-card p-6 sm:p-10 lg:p-12">
        {mode === 'cloudflare' && (
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
            <div>
              <h3 className="font-serif text-2xl font-medium sm:text-3xl">
                Your own Cloudflare account in one command.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Provisions your D1 database, a private R2 media bucket, a 30-day object-locked
                nightly backup bucket, and free Workers AI Whisper transcription. Fits comfortably
                inside Cloudflare’s free tier.
              </p>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                Open your printed URL to create the first account. After that, sign-up locks to
                invite-only — tap <strong className="text-foreground">Invite</strong> inside the app
                to send a link to your spouse, family, or close friends.
              </p>
            </div>

            <CodeBlock title="Deploy to Cloudflare" code={CLOUDFLARE_COMMANDS} />
          </div>
        )}

        {mode === 'local' && (
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
            <div>
              <h3 className="font-serif text-2xl font-medium sm:text-3xl">
                Run on your laptop with zero cloud accounts.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Uses local Miniflare D1 (SQLite) and local R2 storage inside{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">.wrangler/</code>
                . Everything stays in your local folder on{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  localhost:3000
                </code>
                .
              </p>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                Want local voice transcription too? Add a free{' '}
                <code className="font-mono text-foreground">GROQ_API_KEY</code> to{' '}
                <code className="font-mono text-foreground">.env.local</code>.
              </p>
            </div>

            <CodeBlock title="Run locally" code={LOCAL_COMMANDS} />
          </div>
        )}

        {mode === 'tailscale' && (
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
            <div>
              <h3 className="font-serif text-2xl font-medium sm:text-3xl">
                Keep it on a home Mac mini or NAS over Tailscale.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Run Lore on a machine in your closet and expose it only to your family’s Tailnet
                with{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  tailscale serve
                </code>
                . You get a private HTTPS URL (so browser microphone recording and PWA installation
                work on every phone) without opening a single port to the public internet.
              </p>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                Need to share an invite link with a grandparent or friend who isn’t on your Tailnet?
                Switch <code className="font-mono text-foreground">tailscale serve</code> to{' '}
                <code className="font-mono text-foreground">tailscale funnel 3000</code> whenever
                you want.
              </p>
            </div>

            <CodeBlock title="Serve privately over Tailscale" code={TAILSCALE_COMMANDS} />
          </div>
        )}

        {mode === 'postgres' && (
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-12">
            <div>
              <h3 className="font-serif text-2xl font-medium sm:text-3xl">
                Plain Node.js with PostgreSQL and any S3 bucket.
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Lore’s Drizzle ORM layer keeps SQLite and PostgreSQL schemas in strict lockstep. Set{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  DATABASE_PROVIDER=postgres
                </code>{' '}
                and point storage at MinIO, Backblaze B2, AWS S3, or R2.
              </p>
            </div>

            <CodeBlock title="Run on Node + PostgreSQL" code={POSTGRES_COMMANDS} />
          </div>
        )}
      </div>
    </div>
  );
}
