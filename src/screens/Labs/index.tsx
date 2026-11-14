/**
 * Labs: experiments you can try today, where the original home's ideas went,
 * and the ideas still on the shelf. Keeps Home simple while nothing gets lost.
 */
import { ArrowRight, Clapperboard, CloudOff, History, Tv } from 'lucide-react';
import Link from 'next/link';
import { COLLECTIONS_URL, SETTINGS_URL, TIMELINE_URL, VIBES_URL } from '@/constants/pages';
import { cn } from '@/lib/utils';
import AppShell from '@/components/AppShell';
import PageHeader from '@/components/PageHeader';

const TRY = [
  {
    href: VIBES_URL,
    icon: Clapperboard,
    title: 'Vibes',
    body: 'A few seconds of video every day — now on Home. Tap today to open the camera and record up to 10 seconds; keep a streak; watch a month or a year of life in minutes, or the whole family’s together.',
    origin: 'The “Vibe” tile and “Life Unfolds” strip on the original home.',
  },
  {
    href: TIMELINE_URL,
    icon: History,
    title: 'Timeline',
    body: 'Every memory across your collections, in the order it happened. Mix any collections together, see each month’s vibes, and “On this day” from past years.',
    origin:
      'The clock in the original sidebar, and the PRD’s “filters for people, collections, or timeline”.',
  },
  {
    href: COLLECTIONS_URL,
    icon: Tv,
    title: 'Story mode',
    body: 'Open any collection and press Play: its memories full-screen, oldest first — photos drifting slowly, voices playing with their words underneath. Made for the TV at Thanksgiving.',
    origin: 'The collection immersive view.',
  },
  {
    href: SETTINGS_URL,
    icon: CloudOff,
    title: 'On your home screen, with no signal',
    body: 'Add Lore to your home screen: one tap starts a recording. Record, write or take photos on a plane or a campsite — it’s kept on the phone and uploads when you’re back.',
    origin: 'The original offline service.',
  },
];

const WHERE_IT_WENT = [
  [
    'Voice · Media · Write tiles',
    'Record · Write · Photos on Home, a big Record in the sidebar, and one + on phones for Record, Write, Photos or a Vibe. Writing is a full page again.',
  ],
  [
    'Vibe tile, “0 day streak”, Recent Vibes / Life Unfolds',
    'Vibes on Home: a 7-day strip, a tap to record a few seconds, a real streak, and the montage.',
  ],
  ['Recent stories', 'The Recent feed on Home, now without boxes.'],
  [
    'Collection immersive view',
    'Collection pages are editorial again (centred title, faces, quoted voices, big photos) with a floating Record · Write · Photos · Invite · Play pill. Play runs it as a story.',
  ],
  ['Recent collections · New list', 'Collections, with shared ones showing who’s in them.'],
  ['Clock icon', 'Timeline.'],
  ['Bell with a red dot', 'Not yet — see “What’s new” below (the old dot was always on).'],
  ['People · Search icons', 'People and Search, now working.'],
];

type Status = 'Next up' | 'Idea' | 'Parked';

const IDEAS: { title: string; body: string; status: Status; origin?: string }[] = [
  {
    title: 'Suggested titles & people',
    body: 'Cloudflare’s built-in AI suggests a title for each voice note and who’s in it — tap to accept. Never rewrites what anyone said.',
    status: 'Next up',
    origin: 'AI tagging services',
  },
  {
    title: 'What’s new',
    body: '“Sam added 3 photos to Our family.” A calm list of what others added, and an optional weekly email — no badges, no guilt.',
    status: 'Next up',
    origin: 'Activity feed + bell',
  },
  {
    title: 'Prompts',
    body: 'A question when you open the app: “What made Maya laugh today?” or “Ask Grandma about her first job.” Answer by talking.',
    status: 'Idea',
  },
  {
    title: 'Smart views',
    body: 'Automatic views like “With Maya”, “Summer 2025”, “At the lake” — save any of them as a collection.',
    status: 'Idea',
    origin: 'SmartViews',
  },
  {
    title: 'Threads',
    body: 'Link memories that belong together — a trip, a pregnancy, a house renovation — into one story over time.',
    status: 'Idea',
    origin: 'ThreadView',
  },
  {
    title: 'Year in review',
    body: 'Your year as a story: the seconds montage, the best photos, and the voice notes worth hearing again.',
    status: 'Idea',
  },
  {
    title: 'Places',
    body: 'Where photos were taken, on a map; memories by place.',
    status: 'Idea',
    origin: 'Location extraction',
  },
  {
    title: 'Spaces',
    body: 'Groups of collections (“Family”, “Work”). Parked until collections get crowded — fewer things to learn on day one.',
    status: 'Parked',
    origin: 'Spaces → Collections → Stories',
  },
];

export default function LabsScreen() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 sm:px-6 md:pt-8">
        <PageHeader
          title="Labs"
          subtitle="Experiments to try, and every idea from the original Lore — so Home can stay simple without losing any of them."
        />

        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {TRY.map(({ href, icon: Icon, title, body, origin }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/30"
            >
              <Icon className="size-6" />
              <h2 className="mt-4 font-serif text-xl">{title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{body}</p>
              <p className="mt-3 text-xs text-muted-foreground/80">From: {origin}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
                Try it{' '}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">The original home</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What it looked like before the rebuild, and where each piece lives now.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr]">
            <img
              src="/labs/original-home-desktop.jpg"
              alt="The original Lore home on desktop: Voice, Media, Write and Vibe tiles, a Recent Vibes strip, recent stories and collections"
              className="w-full rounded-xl border"
              loading="lazy"
            />
            <img
              src="/labs/original-home-mobile.jpg"
              alt="The original Lore home on a phone"
              className="w-full rounded-xl border sm:h-full sm:object-cover sm:object-top"
              loading="lazy"
            />
          </div>
          <dl className="mt-5 divide-y rounded-2xl border">
            {WHERE_IT_WENT.map(([then, now]) => (
              <div
                key={then}
                className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[1fr_1.4fr] sm:gap-4"
              >
                <dt className="font-medium">{then}</dt>
                <dd className="text-muted-foreground">{now}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">More ideas</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            From the old code and the product doc, roughly in the order they’d help most.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {IDEAS.map((idea) => (
              <div key={idea.title} className="rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">{idea.title}</h3>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px]',
                      idea.status === 'Next up'
                        ? 'bg-foreground text-background'
                        : idea.status === 'Idea'
                          ? 'bg-muted text-muted-foreground'
                          : 'border text-muted-foreground',
                    )}
                  >
                    {idea.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{idea.body}</p>
                {idea.origin && (
                  <p className="mt-2 text-xs text-muted-foreground/80">Was: {idea.origin}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
