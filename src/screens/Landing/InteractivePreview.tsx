/**
 * Interactive, wide desktop walkthrough of Lore's core flows on the landing
 * page — framed with Lore's actual desktop sidebar so it fills horizontal space
 * naturally while keeping generous vertical breathing room.
 */
import { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  Clapperboard,
  Copy,
  Heart,
  History,
  Home,
  Library,
  Link2,
  Lock,
  MessageCircle,
  Mic,
  Pause,
  PenLine,
  Play,
  Plug,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Tv,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoreWordmark } from '@/components/LoreMark';
import UserAvatar from '@/components/UserAvatar';

type PreviewTab = 'voice' | 'collection' | 'vibes' | 'story' | 'mcp';

const TABS: {
  id: PreviewTab;
  label: string;
  icon: typeof Mic;
}[] = [
  { id: 'voice', label: 'Voice memory', icon: Mic },
  { id: 'collection', label: 'Family & friends collections', icon: Library },
  { id: 'vibes', label: 'Vibes (1–10s)', icon: Clapperboard },
  { id: 'story', label: 'Story mode (TV)', icon: Tv },
  { id: 'mcp', label: 'AI assistant (MCP)', icon: Plug },
];

const VOICE_SEGMENTS = [
  '“My father handed me the keys to the ’58 Ford at six in the morning because the milk truck was stuck at the bottom of Cedar Hill.',
  'He looked at me through the frosted window and said, ‘June, don’t touch the brake on the covered bridge — just let second gear hold you.’',
  'I was fifteen years old, my boots were soaked through, and my knees were shaking so hard I could barely find the clutch.”',
];

const VIBE_DAYS = [
  {
    day: 'Mon',
    date: 'Nov 9',
    duration: '0:04',
    caption: 'Maya trying to whistle with two missing front teeth at the bus stop.',
    author: 'Alex',
    collection: 'Our Family',
  },
  {
    day: 'Tue',
    date: 'Nov 10',
    duration: '0:06',
    caption: 'First frost on the back porch — Juniper chasing her own breath in the yard.',
    author: 'Sam',
    collection: 'Our Family',
  },
  {
    day: 'Wed',
    date: 'Nov 11',
    duration: '0:03',
    caption: 'Rain drumming on the skylight while we built the cardboard castle.',
    author: 'Alex',
    collection: 'Our Family',
  },
  {
    day: 'Thu',
    date: 'Nov 12',
    duration: '0:08',
    caption: 'Grandma June showing Maya how to crimp pie crust with a fork.',
    author: 'Grandma June',
    collection: 'Sundays with June',
  },
  {
    day: 'Fri',
    date: 'Nov 13',
    duration: '0:05',
    caption: 'Setting up camp in Big Sur before the fog rolled in off the coast.',
    author: 'Jordan',
    collection: 'Big Sur Weekend',
  },
  {
    day: 'Sat',
    date: 'Nov 14',
    duration: '0:07',
    caption: 'Campfire coffee at 7 a.m. while everyone else was still asleep in their tents.',
    author: 'Alex',
    collection: 'Big Sur Weekend',
  },
  {
    day: 'Today',
    date: 'Nov 15',
    duration: '1–10s',
    caption: 'Tap Today to open the camera. Tap to start and stop — up to 10 seconds.',
    author: 'You',
    collection: 'Moments',
    isToday: true,
  },
];

export default function InteractivePreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab>('voice');

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Single-row tab bar */}
      <div
        role="tablist"
        aria-label="Explore how Lore works"
        className="flex gap-2 overflow-x-auto pb-2 md:justify-center md:overflow-visible"
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all',
                active
                  ? 'border-foreground bg-foreground text-background shadow-sm'
                  : 'bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Wide App Frame */}
      <div className="mt-6 overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="size-2.5 rounded-full bg-foreground/20" />
            <span className="ml-2 font-mono text-[11px]">
              {activeTab === 'voice' && 'Home · Voice Note & Whisper Transcript'}
              {activeTab === 'collection' && 'Collections · Family & Friends Sharing'}
              {activeTab === 'vibes' && 'Vibes · A Few Seconds a Day'}
              {activeTab === 'story' && 'Story Mode · Full-Screen TV Player'}
              {activeTab === 'mcp' && 'MCP Server · Connected AI Assistant'}
            </span>
          </div>
          <span className="hidden sm:inline">
            {activeTab === 'voice' && 'Interactive — press Play on the voice note'}
            {activeTab === 'collection' && 'Switch between a family archive & a trip with friends'}
            {activeTab === 'vibes' && 'Click any day to preview'}
            {activeTab === 'story' && 'Step through full-screen slides'}
            {activeTab === 'mcp' && 'OAuth 2.1 · Read & add only'}
          </span>
        </div>

        {activeTab === 'story' ? (
          <StoryModeDemo />
        ) : (
          <div className="grid md:grid-cols-[220px_1fr]">
            {/* Authentic Lore Desktop Sidebar */}
            <aside className="hidden flex-col border-r bg-muted/10 p-4 md:flex">
              <LoreWordmark className="mb-5 px-2 text-xl" />

              <button
                type="button"
                onClick={() => setActiveTab('voice')}
                className="flex h-10 items-center justify-center gap-2 rounded-full bg-primary text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                <Mic className="size-3.5" /> Record
              </button>
              <div className="mb-5 mt-1.5 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                <span className="px-1.5 py-0.5">Write</span>
                <span>·</span>
                <span className="px-1.5 py-0.5">Photos</span>
              </div>

              <div className="space-y-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('voice')}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                    activeTab === 'voice'
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Home className="size-3.5" /> Home
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('story')}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  <History className="size-3.5" /> Timeline
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('vibes')}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                    activeTab === 'vibes'
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Clapperboard className="size-3.5" /> Vibes
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('collection')}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                    activeTab === 'collection'
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Library className="size-3.5" /> Collections
                </button>

                <ul className="ml-3.5 mt-1 space-y-0.5 border-l pl-2.5 text-[11px] text-muted-foreground">
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveTab('collection')}
                      className="w-full truncate rounded px-2 py-1 text-left font-medium text-foreground hover:bg-accent/60"
                    >
                      Our Family
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveTab('collection')}
                      className="w-full truncate rounded px-2 py-1 text-left hover:bg-accent/60 hover:text-foreground"
                    >
                      Sundays with June
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setActiveTab('collection')}
                      className="w-full truncate rounded px-2 py-1 text-left hover:bg-accent/60 hover:text-foreground"
                    >
                      Big Sur Weekend
                    </button>
                  </li>
                  <li className="flex items-center justify-between rounded px-2 py-1">
                    <span>Personal</span>
                    <Lock className="size-2.5 opacity-60" />
                  </li>
                </ul>

                <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-muted-foreground">
                  <Users className="size-3.5" /> People
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('mcp')}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                    activeTab === 'mcp'
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <Search className="size-3.5" /> Search & AI
                </button>
              </div>
            </aside>

            {/* Main Content Stage */}
            <div className="min-w-0">
              {activeTab === 'voice' && <VoiceMemoryDemo />}
              {activeTab === 'collection' && <SharedCollectionDemo />}
              {activeTab === 'vibes' && <VibesDemo />}
              {activeTab === 'mcp' && <McpAssistantDemo />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VoiceMemoryDemo() {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(18);
  const [hearted, setHearted] = useState(true);
  const [hearts, setHearts] = useState(4);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setPlaying(false);
          return 0;
        }
        return prev + 2;
      });
    }, 180);
    return () => clearInterval(timer);
  }, [playing]);

  const activeSegmentIndex = Math.min(
    VOICE_SEGMENTS.length - 1,
    Math.floor((progress / 100) * VOICE_SEGMENTS.length),
  );

  const totalSeconds = 102;
  const currentSeconds = Math.round((progress / 100) * totalSeconds);
  const formatSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="p-6 sm:p-10 lg:px-14 lg:py-12">
      {/* Capture Bar */}
      <div className="mb-10 grid max-w-xl grid-cols-[1.4fr_1fr_1fr] gap-2.5">
        <button
          type="button"
          onClick={() => {
            setPlaying((p) => !p);
            if (progress === 0) setProgress(6);
          }}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        >
          <Mic className="size-4" /> Record
        </button>
        <div className="flex h-12 items-center justify-center gap-1.5 rounded-full border bg-background text-sm font-medium text-muted-foreground">
          <PenLine className="size-3.5" /> Write
        </div>
        <div className="flex h-12 items-center justify-center gap-1.5 rounded-full border bg-background text-sm font-medium text-muted-foreground">
          <Camera className="size-3.5" /> Photos
        </div>
      </div>

      <article className="border-t pt-8">
        <header className="flex items-center gap-3">
          <UserAvatar name="Alex Rivera" className="size-9" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">
              Alex Rivera{' '}
              <span className="font-normal text-muted-foreground">· Sundays with Grandma June</span>
            </p>
            <time className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Sunday · November 8
            </time>
          </div>
        </header>

        <h3 className="mt-5 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
          How Grandma June learned to drive the ’58 Ford in the snow
        </h3>

        <div className="mt-6 flex max-w-md items-center gap-3 rounded-full bg-muted/70 p-1.5 pr-4">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause demo voice note' : 'Play demo voice note'}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
          >
            {playing ? (
              <Pause className="size-4 fill-current" />
            ) : (
              <Play className="size-4 translate-x-px fill-current" />
            )}
          </button>

          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            aria-label="Seek demo audio"
            onChange={(e) => setProgress(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/15 accent-foreground"
            style={{
              background: `linear-gradient(to right, hsl(var(--foreground)) ${progress}%, hsl(var(--foreground) / 0.15) ${progress}%)`,
            }}
          />

          {playing && (
            <span className="flex h-3.5 items-end gap-[2.5px]" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-full w-[2.5px] origin-bottom animate-sound-bar rounded-full bg-foreground"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          )}

          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {playing || progress > 0 ? `${formatSec(currentSeconds)} / 1:42` : '1:42'}
          </span>
        </div>

        <blockquote className="mt-7 max-w-3xl space-y-3 border-l border-foreground/25 pl-6 font-serif text-xl italic leading-relaxed text-foreground/85 sm:text-2xl">
          {VOICE_SEGMENTS.map((seg, idx) => (
            <p
              key={idx}
              className={cn(
                'transition-opacity duration-300',
                playing && idx !== activeSegmentIndex && 'opacity-50',
                playing && idx === activeSegmentIndex && 'text-foreground opacity-100',
              )}
            >
              {seg}
            </p>
          ))}
        </blockquote>

        <footer className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => {
              setHearted((h) => !h);
              setHearts((c) => (hearted ? c - 1 : c + 1));
            }}
            aria-pressed={hearted}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors hover:bg-accent hover:text-foreground',
              hearted && 'font-medium text-foreground',
            )}
          >
            <Heart className={cn('size-4', hearted && 'fill-current')} />
            {hearts}
          </button>
          <span className="inline-flex items-center gap-1.5 px-2 py-1">
            <MessageCircle className="size-4" /> 2
          </span>
          <span className="ml-auto text-xs">with Grandma June, Maya</span>
        </footer>
      </article>
    </div>
  );
}

const COLLECTION_MODES = {
  family: {
    badge: 'Family Collection',
    name: 'Our Family',
    description: 'Everyday moments, Maya’s funny quotes, and Sunday dinners together.',
    members: ['Alex Rivera', 'Sam Rivera', 'Grandma June'],
    memberSummary: 'You, Sam and Grandma June',
    inviteHeading: 'Invite your partner or family',
    inviteSub: 'Send a one-time link by text or iMessage. They’ll land right in “Our Family”.',
    contributorSub: 'For your spouse, parents, or kids',
    sampleMemory: {
      author: 'Sam Rivera',
      time: 'YESTERDAY · 6:15 PM',
      title: 'Maya explaining why dogs don’t need umbrellas',
      quote:
        '“Because their fur is already a raincoat that grows out of their skin, Dad. Everyone knows that.”',
    },
  },
  friends: {
    badge: 'Friends Trip Collection',
    name: 'Big Sur Weekend ’26',
    description:
      'Six friends, three tents, campfire stories, and every photo from Highway 1 in one shared place.',
    members: ['Alex Rivera', 'Sam Rivera', 'Jordan Lee', 'Priya Patel', 'Marcus Vance'],
    memberSummary: 'You, Sam, Jordan, Priya and Marcus',
    inviteHeading: 'Invite friends to the trip collection',
    inviteSub:
      'Drop the link in the group chat — everyone adds their voice notes, photos, and daily Vibes.',
    contributorSub: 'Everyone on the trip can add',
    sampleMemory: {
      author: 'Jordan Lee',
      time: 'SATURDAY · 11:20 PM',
      title: 'Around the fire after the raccoons stole the marshmallows',
      quote:
        '“Marcus tried to negotiate with a raccoon using a graham cracker while the rest of us were crying laughing in the tent…”',
    },
  },
};

function SharedCollectionDemo() {
  const [collectionType, setCollectionType] = useState<'family' | 'friends'>('family');
  const [role, setRole] = useState<'contributor' | 'viewer'>('contributor');
  const [copied, setCopied] = useState(false);

  const current = COLLECTION_MODES[collectionType];
  const demoInviteUrl =
    collectionType === 'family'
      ? 'https://lore.yourfamily.com/invite/9f8k2m4x'
      : 'https://ourlore.ai/invite/big-sur-7x2k';

  const copyDemoLink = async () => {
    try {
      await navigator.clipboard.writeText(demoInviteUrl);
      setCopied(true);
      toast.success('Copied demo invite link');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-6 sm:p-10 lg:px-12 lg:py-12">
      {/* Switch between Family and Friends collection examples */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <div className="text-xs text-muted-foreground">
          Share collections with your household, extended family, or close friends:
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setCollectionType('family')}
            className={cn(
              'rounded-full border px-3.5 py-1 text-xs font-medium transition-colors',
              collectionType === 'family'
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Family (“Our Family”)
          </button>
          <button
            type="button"
            onClick={() => setCollectionType('friends')}
            className={cn(
              'rounded-full border px-3.5 py-1 text-xs font-medium transition-colors',
              collectionType === 'friends'
                ? 'border-foreground bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Friends (“Big Sur Weekend”)
          </button>
        </div>
      </div>

      {/* Wide 2-column layout: Collection Header + Recent Memory on left, Invite Drawer on right */}
      <div className="grid items-start gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="mb-5 h-[3px] w-10 rounded-full bg-foreground" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {current.badge}
          </span>
          <h3 className="mt-2 font-serif text-4xl font-medium leading-[1.06] tracking-tight sm:text-5xl">
            {current.name}
          </h3>
          <p className="mt-3 font-serif text-lg leading-relaxed text-muted-foreground">
            {current.description}
          </p>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex -space-x-2">
              {current.members.map((m) => (
                <UserAvatar key={m} name={m} className="size-9 text-xs ring-2 ring-card" />
              ))}
              <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-foreground/40 bg-background text-foreground ring-2 ring-card">
                <Plus className="size-3.5" />
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{current.memberSummary}</span>
          </div>

          {/* Sample memory inside this collection */}
          <div className="mt-8 border-t pt-6">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <UserAvatar name={current.sampleMemory.author} className="size-6" />
              <span className="font-medium text-foreground">{current.sampleMemory.author}</span>
              <span>·</span>
              <span className="uppercase tracking-wider">{current.sampleMemory.time}</span>
            </div>
            <h4 className="mt-2.5 font-serif text-xl font-medium">{current.sampleMemory.title}</h4>
            <blockquote className="mt-2 border-l border-foreground/25 pl-4 font-serif text-base italic leading-relaxed text-muted-foreground">
              {current.sampleMemory.quote}
            </blockquote>
          </div>
        </div>

        {/* Partner / Friends Invite Card */}
        <div className="rounded-2xl border bg-background p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-serif text-xl font-medium">{current.inviteHeading}</h4>
            <UserPlus className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{current.inviteSub}</p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole('contributor')}
              className={cn(
                'rounded-xl border p-3 text-left text-xs transition-colors',
                role === 'contributor'
                  ? 'border-foreground bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className="font-medium">Can add memories</div>
              <div
                className={cn(
                  'mt-0.5 text-[11px]',
                  role === 'contributor' ? 'text-background/75' : 'text-muted-foreground',
                )}
              >
                {current.contributorSub}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setRole('viewer')}
              className={cn(
                'rounded-xl border p-3 text-left text-xs transition-colors',
                role === 'viewer'
                  ? 'border-foreground bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className="font-medium">Can only view</div>
              <div
                className={cn(
                  'mt-0.5 text-[11px]',
                  role === 'viewer' ? 'text-background/75' : 'text-muted-foreground',
                )}
              >
                Read, listen & heart
              </div>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 p-2.5 pl-3.5">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate font-mono text-xs">{demoInviteUrl}</span>
            <button
              type="button"
              onClick={copyDemoLink}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            Only members of “{current.name}” can see what’s inside. Your <strong>Personal</strong>{' '}
            collection stays private to you.
          </p>
        </div>
      </div>
    </div>
  );
}

function VibesDemo() {
  const [selectedIdx, setSelectedIdx] = useState(4);
  const current = VIBE_DAYS[selectedIdx];

  return (
    <div className="p-6 sm:p-10 lg:px-14 lg:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-serif text-2xl font-medium sm:text-3xl">
            Vibes{' '}
            <span className="font-sans text-sm font-normal text-muted-foreground">
              · a few seconds a day
            </span>
          </h3>
        </div>
        <span className="text-sm text-muted-foreground">14-day streak · 86 days this year</span>
      </div>

      <ol className="mt-8 grid max-w-2xl grid-cols-7 gap-3 sm:gap-4">
        {VIBE_DAYS.map((item, idx) => {
          const active = idx === selectedIdx;
          return (
            <li key={item.day} className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={cn(
                  'relative flex aspect-square w-full max-w-14 items-center justify-center rounded-full text-xs font-medium transition-all',
                  item.isToday
                    ? 'border-2 border-dashed border-foreground/70 text-foreground'
                    : 'bg-muted text-foreground ring-[1.5px] ring-foreground/60 ring-offset-2 ring-offset-card',
                  active && 'scale-105 bg-foreground text-background ring-2 ring-foreground',
                )}
              >
                {item.isToday ? <Plus className="size-5" /> : <span>{item.duration}</span>}
              </button>
              <span
                className={cn(
                  'text-[11px]',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {item.day}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 max-w-2xl rounded-2xl border bg-muted/20 p-6">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.16em] text-foreground">
            {current.day} · {current.date}
          </span>
          <span>
            {current.author} · <strong>{current.collection}</strong>
          </span>
        </div>
        <p className="mt-3 font-serif text-xl leading-relaxed sm:text-2xl">“{current.caption}”</p>
      </div>
    </div>
  );
}

const STORY_SLIDES = [
  {
    collection: 'Our Family',
    date: 'Sunday, October 14, 2024',
    author: 'Alex Rivera',
    title: 'The day we brought Juniper home in a cardboard box',
    quote:
      '“She fell asleep on Maya’s sneaker the entire drive back from the shelter, snoring like a tiny chainsaw.”',
  },
  {
    collection: 'Sundays with Grandma June',
    date: 'Thursday, December 24, 2025',
    author: 'Grandma June',
    title: 'How my mother made cinnamon rolls on Christmas Eve',
    quote:
      '“You never rolled the dough with a pin — you stretched it with the backs of your knuckles on a floured tablecloth…”',
  },
  {
    collection: 'Big Sur Weekend ’26',
    date: 'Saturday, July 18, 2026',
    author: 'Jordan Lee',
    title: 'Watching the sun drop into the Pacific from the cliff trail',
    quote:
      '“Nobody checked their phone for three straight days. We just sat on the tailgate until the stars came out.”',
  },
];

function StoryModeDemo() {
  const [slideIdx, setSlideIdx] = useState(0);
  const slide = STORY_SLIDES[slideIdx];

  return (
    <div className="bg-neutral-950 px-6 py-12 text-white sm:px-14 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex h-1 gap-1.5">
          {STORY_SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Jump to memory ${i + 1}`}
              onClick={() => setSlideIdx(i)}
              className="relative h-full flex-1 overflow-hidden rounded-full bg-white/25"
            >
              <span
                className={cn(
                  'absolute inset-0 origin-left bg-white transition-transform duration-500',
                  i <= slideIdx ? 'scale-x-100' : 'scale-x-0',
                )}
              />
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-white/60">
          <span>
            {slide.collection} · {slideIdx + 1} of {STORY_SLIDES.length}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Volume2 className="size-3.5" /> Playing voice note
          </span>
        </div>

        <div className="my-14 flex min-h-[13rem] flex-col justify-center">
          <p className="text-xs uppercase tracking-[0.16em] text-white/65">
            {slide.author} · {slide.date}
          </p>
          <h3 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight text-white sm:text-5xl">
            {slide.title}
          </h3>
          <p className="mt-5 max-w-3xl font-serif text-xl italic leading-relaxed text-white/85 sm:text-2xl">
            {slide.quote}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-white/15 pt-5">
          <span className="text-xs text-white/60">
            Play any family or friends collection full-screen on the TV
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setSlideIdx((i) => (i - 1 + STORY_SLIDES.length) % STORY_SLIDES.length)
              }
              className="rounded-full border border-white/25 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/10"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setSlideIdx((i) => (i + 1) % STORY_SLIDES.length)}
              className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-white/90"
            >
              Next memory
            </button>
            <button
              type="button"
              onClick={() => setSlideIdx(0)}
              aria-label="Restart story"
              className="rounded-full border border-white/25 p-1.5 text-white hover:bg-white/10"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function McpAssistantDemo() {
  return (
    <div className="p-6 sm:p-10 lg:px-14 lg:py-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-xs text-muted-foreground">
          https://lore.yourfamily.com/mcp
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
          <ShieldCheck className="size-3.5" /> Read & add only · Zero delete tools
        </span>
      </div>

      <div className="mt-8 max-w-2xl space-y-4">
        <div className="ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
          What were the funny words Maya used when she was three, and what happened with the
          raccoons on our Big Sur trip?
        </div>

        <div className="rounded-2xl border bg-muted/20 p-5 text-sm leading-relaxed">
          <p className="font-medium">Found 2 memories across your collections:</p>
          <ul className="mt-3 space-y-3 text-muted-foreground">
            <li className="border-l-2 border-foreground/30 pl-3.5">
              <strong className="text-foreground">Our Family · Oct 19, 2025 (Sam):</strong> Maya
              called helicopters <em>“sky-blenders”</em> and escalators{' '}
              <em>“moving stairs for tired knees.”</em>
            </li>
            <li className="border-l-2 border-foreground/30 pl-3.5">
              <strong className="text-foreground">Big Sur Weekend · Jul 18, 2026 (Jordan):</strong>{' '}
              <em>
                “Marcus tried to negotiate with a raccoon using a graham cracker while the rest of
                us were crying laughing in the tent.”
              </em>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
