/**
 * Open-source landing page for Lore: generous vertical and horizontal breathing
 * room, empathetic storytelling around family & shared adventures with friends,
 * interactive preview (including partner/family & friend invites), features,
 * self-hosting options (Cloudflare, Local, Tailscale, Postgres), and a Coming
 * Soon showcase for Hosted Lore (collaborating on collections across households
 * and friend groups).
 */
import { useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  Check,
  Clapperboard,
  CloudOff,
  Copy,
  History,
  Lock,
  Mic,
  Moon,
  PenLine,
  Plug,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Tv,
  Users,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import Head from 'next/head';
import { toast } from 'sonner';
import { GITHUB_URL } from '@/constants/pages';
import { LoreWordmark } from '@/components/LoreMark';
import { Button } from '@/components/ui/button';
import HostingSection from './HostingSection';
import InteractivePreview from './InteractivePreview';

const subscribe = () => () => {};

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

const HUMAN_TRUTHS = [
  {
    eyebrow: 'The 9 p.m. blank page',
    title: 'Typing a journal entry at bedtime feels like homework.',
    body: 'So we skip it. In Lore, talking for thirty seconds while walking the dog is enough — and it keeps the laugh and cadence of their actual voice.',
  },
  {
    eyebrow: '38,000 photos, zero story',
    title: 'A photo shows what someone looked like. A voice note keeps who they were.',
    body: 'Camera rolls bury our favorite moments under receipts and screenshots, and family or trip group chats scroll away by Tuesday.',
  },
  {
    eyebrow: 'Built for decades',
    title: 'Your family’s archive shouldn’t rent space from a startup.',
    body: 'You want these recordings in twenty years without paying $12/month forever or worrying a company will shut down.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Tap once and talk — even offline.',
    body: 'Open Lore from your phone’s home screen straight into Record. Audio, writing, and photos save to your device first and upload when signal returns.',
  },
  {
    step: '02',
    title: 'Shared with your family, transcribed word-for-word.',
    body: 'Memories save to “Our Family” by default (or “Personal” when it’s just for you) while Whisper writes down what was said — without ever rewriting your words.',
  },
  {
    step: '03',
    title: 'Share collections with family & friends.',
    body: 'Create a collection for your household (“Our Family”) or a shared trip with friends (“Big Sur Weekend ’26”) and text an invite link so everyone can add their side of the story.',
  },
  {
    step: '04',
    title: 'Relive it on the TV, on the Timeline, or with AI.',
    body: 'Press ▶ Play on any collection for full-screen Story Mode on the TV, browse the Timeline, or ask ChatGPT and Claude via MCP.',
  },
];

const FEATURES = [
  {
    icon: Mic,
    title: 'Voice notes & Whisper transcripts',
    body: 'Saved the instant you stop talking, then transcribed automatically via Cloudflare Workers AI or Groq.',
  },
  {
    icon: Users,
    title: 'Collections for family & close friends',
    body: 'Invite your spouse, parents, or friends on a trip by link as Contributors (can add memories) or Viewers (read, listen, heart, and comment).',
  },
  {
    icon: PenLine,
    title: 'Full-page writer & photo mosaics',
    body: 'A calm Markdown page with voice dictation at the cursor and photo layouts that respect every shot.',
  },
  {
    icon: Clapperboard,
    title: 'Vibes: a few seconds a day',
    body: 'Record 1–10 seconds of daily life and watch a month, a year, or a weekend trip play back as one stitched montage.',
  },
  {
    icon: Tv,
    title: 'Story Mode for the TV',
    body: 'Plays a collection full-screen from the oldest memory — photos drifting slowly while voices play with subtitles.',
  },
  {
    icon: History,
    title: 'Timeline, People & “On this day”',
    body: 'Browse chronologically across collections, revisit past years on the day they happened, or view everything tagged with a person.',
  },
  {
    icon: CloudOff,
    title: 'Installable PWA & offline outbox',
    body: 'Captures in airplane mode or deep in the woods, queuing on your phone until your connection comes back.',
  },
  {
    icon: Plug,
    title: 'OAuth 2.1 MCP server for AI',
    body: 'Connect ChatGPT, Claude, or Ri to search and save memories. Built with zero delete tools so AI can never erase anything.',
  },
  {
    icon: ShieldCheck,
    title: 'Private media & 3-layer backups',
    body: 'Photos and audio are never public URLs. Protected by D1 Time Travel, nightly 30-day locked SQL dumps, and a 30-day trash.',
  },
];

const HOSTED_CIRCLES = [
  {
    name: 'Our Family',
    badge: 'Default · Household · 4 members',
    detail: 'Everyday stories with your spouse, kids, and grandparents in one shared home.',
    members: ['AR', 'SR', 'MJ', 'ER'],
    locked: false,
  },
  {
    name: 'Big Sur Weekend ’26',
    badge: 'Friends · 6 contributors',
    detail: 'Everyone drops in their film photos, campfire voice recordings, and 3-second Vibes.',
    members: ['AR', 'SR', 'ML', 'DK', 'JL', '+1'],
    locked: false,
  },
  {
    name: 'The Lakehouse Years',
    badge: 'Extended family · 9 members',
    detail: 'Cross-household summer memories where cousins, aunts, and uncles collaborate.',
    members: ['AR', 'SR', 'TR', 'KR', '+5'],
    locked: false,
  },
  {
    name: 'Personal',
    badge: 'Private to you',
    detail: 'Your personal voice notes, drafts, and reflections that only you can see.',
    members: ['You'],
    locked: true,
  },
];

export default function LandingScreen() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [copiedHeroCmd, setCopiedHeroCmd] = useState(false);

  const heroCmd =
    'git clone https://github.com/dynamismlabs/lore.git && cd lore && pnpm install && pnpm deploy:cloudflare';

  const copyHeroCommand = async () => {
    try {
      await navigator.clipboard.writeText(heroCmd);
      setCopiedHeroCmd(true);
      toast.success('Copied deploy command');
      setTimeout(() => setCopiedHeroCmd(false), 2000);
    } catch {
      toast.error('Could not copy command');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <Head>
        <title>Lore — A private place for your family’s and friends’ memories</title>
        <meta
          name="description"
          content="An open-source place for your family’s memories and shared experiences with close friends. Tap once to record voice notes with automatic Whisper transcription, invite your partner, family, or friend group, and self-host anywhere."
        />
      </Head>

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-10">
          <div className="flex items-center gap-3">
            <a href="#top" className="flex items-center">
              <LoreWordmark className="text-2xl tracking-tight" />
            </a>
            <span className="hidden rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground sm:inline-block">
              Open Source · MIT
            </span>
          </div>

          <nav
            aria-label="Page sections"
            className="hidden items-center gap-8 text-sm text-muted-foreground md:flex"
          >
            <a href="#inside" className="transition-colors hover:text-foreground">
              Preview
            </a>
            <a href="#why" className="transition-colors hover:text-foreground">
              Why Lore
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#self-host" className="transition-colors hover:text-foreground">
              Self-Host
            </a>
            <a href="#cloud" className="transition-colors hover:text-foreground">
              Hosted
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                aria-label={
                  resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
                }
                className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </button>
            )}

            <Button asChild size="sm" className="h-9 rounded-full px-4 text-xs sm:text-sm">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <GitHubMark className="size-4" />
                <span>Star on GitHub</span>
                <Star className="size-3.5 fill-current opacity-85" />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ==================== HERO ==================== */}
        <section className="mx-auto max-w-5xl px-6 pb-24 pt-20 text-center sm:px-10 sm:pb-32 sm:pt-28">
          <div className="mx-auto mb-10 h-[3px] w-12 rounded-full bg-foreground" aria-hidden />

          <h1 className="mx-auto max-w-4xl text-balance font-serif text-4xl font-medium leading-[1.06] tracking-tight sm:text-6xl lg:text-[4.35rem]">
            You think you’ll remember it. <span className="font-normal italic">You won’t.</span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl sm:leading-relaxed">
            The word your four-year-old invented at breakfast. The story your grandmother told while
            drying the dishes. The weekend trip with your closest friends.{' '}
            <strong className="font-medium text-foreground">Lore</strong> keeps their voices, writes
            down every word, and gives your family and friends a quiet place to remember together.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 w-full rounded-full px-7 text-base shadow-sm sm:w-auto"
            >
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <GitHubMark className="size-5" />
                <span>Star Lore on GitHub</span>
                <Star className="size-4 fill-current" />
              </a>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 w-full rounded-full px-6 text-base sm:w-auto"
            >
              <a href="#self-host">
                <span>Self-host in 2 minutes</span>
                <ArrowDown className="size-4" />
              </a>
            </Button>
          </div>

          <div className="mx-auto mt-8 inline-flex max-w-full items-center gap-2.5 rounded-full border bg-muted/30 py-1.5 pl-4 pr-2 text-xs text-muted-foreground">
            <span className="truncate font-mono text-[11px] text-foreground">
              pnpm deploy:cloudflare
            </span>
            <button
              type="button"
              onClick={copyHeroCommand}
              aria-label="Copy full clone and deploy command"
              className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
            >
              {copiedHeroCmd ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copiedHeroCmd ? 'Copied' : 'Copy'}
            </button>
          </div>
        </section>

        {/* ==================== INTERACTIVE APP PREVIEW ==================== */}
        <section id="inside" className="scroll-mt-24 px-6 pb-32 sm:px-10 sm:pb-40">
          <InteractivePreview />
        </section>

        {/* ==================== WHY IT MATTERS (GENEROUS WHITESPACE) ==================== */}
        <section id="why" className="scroll-mt-24 border-t px-6 py-28 sm:px-10 sm:py-36">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Why We Built Lore
              </p>
              <h2 className="mt-3 text-balance font-serif text-3xl font-medium leading-tight tracking-tight sm:text-5xl">
                The moment of capture is fragile.
              </h2>
              <p className="mt-5 font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
                We built Lore for two people sitting at the kitchen table — and for the friends
                driving home from a weekend in the mountains — who don’t want the years to blur
                together.
              </p>
            </div>

            <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-12">
              {HUMAN_TRUTHS.map((item) => (
                <div key={item.title} className="border-t pt-6">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {item.eyebrow}
                  </span>
                  <h3 className="mt-3 font-serif text-2xl font-medium leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== HOW IT WORKS ==================== */}
        <section
          id="how-it-works"
          className="scroll-mt-24 border-t bg-muted/15 px-6 py-28 sm:px-10 sm:py-36"
        >
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                How It Works
              </p>
              <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-5xl">
                One tap in the moment. Organized forever after.
              </h2>
            </div>

            <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step} className="flex flex-col border-t pt-6">
                  <span className="font-serif text-2xl text-muted-foreground/60">{item.step}</span>
                  <h3 className="mt-3 font-serif text-2xl font-medium leading-snug">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== FEATURES ==================== */}
        <section id="features" className="scroll-mt-24 border-t px-6 py-28 sm:px-10 sm:py-36">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Everything Included
              </p>
              <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-5xl">
                Built for your family and your closest friends.
              </h2>
            </div>

            <div className="mt-16 grid gap-x-12 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex flex-col">
                  <Icon className="size-5 text-foreground" />
                  <h3 className="mt-4 font-serif text-xl font-medium leading-snug">{title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ==================== SELF-HOSTING OPTIONS ==================== */}
        <section
          id="self-host"
          className="scroll-mt-24 border-t bg-muted/15 px-6 py-28 sm:px-10 sm:py-36"
        >
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <div className="mx-auto mb-8 h-[3px] w-12 rounded-full bg-foreground" aria-hidden />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Self-Host Anywhere
            </p>
            <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight sm:text-5xl">
              Your archive, on your infrastructure.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Deploy to Cloudflare in one command, run locally on your laptop, share a home Mac mini
              over Tailscale, or bring your own PostgreSQL and S3 server.
            </p>
          </div>

          <HostingSection />
        </section>

        {/* ==================== HOSTED BY US (COMING SOON) ==================== */}
        <section id="cloud" className="scroll-mt-24 border-t px-6 py-28 sm:px-10 sm:py-36">
          <div className="mx-auto max-w-6xl rounded-3xl border bg-card p-8 sm:p-12 lg:p-16">
            <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                  <Sparkles className="size-3.5" /> Coming Soon · Hosted by Us
                </span>

                <h2 className="mt-5 text-balance font-serif text-3xl font-medium leading-tight tracking-tight sm:text-5xl">
                  Hosted by us. Built to collaborate across families and friends.
                </h2>

                <p className="mt-5 font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  Self-hosting is wonderful for your own household. With{' '}
                  <strong className="font-medium text-foreground">Hosted Lore</strong>, we run the
                  infrastructure so you can keep your family’s private home <em>and</em> spin up
                  shared collections with friends — weekend trips, weddings, reunions, or college
                  friends — without anyone managing servers.
                </p>

                <ul className="mt-7 space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span>
                      <strong className="font-medium text-foreground">
                        Family first, friends included:
                      </strong>{' '}
                      Share “Our Family” by default with your partner, collaborate on trip or event
                      collections with friends, and keep “Personal” private to you.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span>
                      <strong className="font-medium text-foreground">
                        Cross-household collaboration:
                      </strong>{' '}
                      Friends and extended family join a single collection by link and add their own
                      voice notes, photos, and Vibes.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-foreground" />
                    <span>
                      <strong className="font-medium text-foreground">Zero lock-in, ever:</strong>{' '}
                      Full one-click export of your SQLite database and original media to self-host
                      whenever you want.
                    </span>
                  </li>
                </ul>

                <div className="mt-9">
                  <Button asChild variant="outline" className="h-11 rounded-full px-6">
                    <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                      <GitHubMark className="size-4" />
                      <span>Star on GitHub to follow the Hosted launch</span>
                    </a>
                  </Button>
                </div>
              </div>

              {/* Right column: Visual showcase of shared collections across family & friends */}
              <div className="rounded-2xl border bg-muted/20 p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Your Circles in Hosted Lore
                  </span>
                  <span className="text-xs text-muted-foreground">One account · Any circle</span>
                </div>

                <div className="space-y-3">
                  {HOSTED_CIRCLES.map((circle) => (
                    <div
                      key={circle.name}
                      className="rounded-2xl border bg-background p-4 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-lg font-medium">{circle.name}</span>
                          {circle.locked && <Lock className="size-3.5 text-muted-foreground" />}
                        </div>
                        <span className="rounded-full border bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {circle.badge}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                        {circle.detail}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex -space-x-1.5">
                          {circle.members.map((initials) => (
                            <span
                              key={initials}
                              className="flex size-6 items-center justify-center rounded-full border bg-muted text-[10px] font-medium text-foreground"
                            >
                              {initials}
                            </span>
                          ))}
                        </div>
                        {!circle.locked && (
                          <span className="text-[11px] font-medium text-muted-foreground">
                            Shared collection
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== CLOSING CALL TO ACTION ==================== */}
        <section className="border-t bg-muted/20 px-6 py-28 text-center sm:px-10 sm:py-36">
          <div className="mx-auto max-w-2xl">
            <div className="mx-auto mb-8 h-[3px] w-12 rounded-full bg-foreground" aria-hidden />
            <h2 className="text-balance font-serif text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
              Keep the little things.
            </h2>
            <p className="mx-auto mt-4 font-serif text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Free, open source under the MIT License, and built to outlast us.
            </p>

            <div className="mt-9 flex justify-center">
              <Button asChild size="lg" className="h-12 rounded-full px-8 text-base shadow-sm">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  <GitHubMark className="size-5" />
                  <span>Star Lore on GitHub</span>
                  <Star className="size-4 fill-current" />
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-6 py-12 text-xs text-muted-foreground sm:px-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <LoreWordmark className="text-lg text-foreground" />
            <span>·</span>
            <span>A private place for your family’s and friends’ memories.</span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline"
            >
              <GitHubMark className="size-3.5" />
              GitHub
            </a>
            <a href="#inside" className="hover:text-foreground">
              Preview
            </a>
            <a href="#self-host" className="hover:text-foreground">
              Self-Host
            </a>
            <a href="#cloud" className="hover:text-foreground">
              Hosted (Soon)
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
