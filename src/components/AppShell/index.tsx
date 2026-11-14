/**
 * The signed-in frame: sidebar with a big Record button on desktop; on phones
 * a bottom tab bar whose + opens Record, Write, Photos or Vibe. Waits for the
 * session before deciding anything, then sends signed-out visitors to sign in
 * (and back here afterwards). With no signal it opens as whoever was signed in
 * on this device, so capturing still works (the outbox uploads it later).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Clapperboard,
  CloudOff,
  History,
  Home,
  Library,
  Mic,
  PenLine,
  Search,
  Settings,
  UploadCloud,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  COLLECTIONS_URL,
  HOME_URL,
  LOGIN_URL,
  PEOPLE_URL,
  SEARCH_URL,
  SETTINGS_URL,
  TIMELINE_URL,
  VIBES_URL,
  collectionUrl,
} from '@/constants/pages';
import { readOpenToRecord } from '@/lib/client/device';
import { trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import { useOnline } from '@/hooks/useOnline';
import { useViewer } from '@/hooks/useViewer';
import { useCapture } from '@/components/Capture/CaptureProvider';
import LoreMark from '@/components/LoreMark';
import { useOutbox } from '@/components/Outbox/OutboxProvider';
import QuickInviteDialog from '@/components/QuickInviteDialog';
import UserAvatar from '@/components/UserAvatar';
import CaptureMenu from './CaptureMenu';

interface Props {
  children: React.ReactNode;
  /** Collection that capture buttons should save into (defaults to Moments). */
  captureCollectionId?: string;
}

const NAV = [
  { href: HOME_URL, label: 'Home', icon: Home },
  { href: TIMELINE_URL, label: 'Timeline', icon: History },
  { href: VIBES_URL, label: 'Vibes', icon: Clapperboard },
  { href: COLLECTIONS_URL, label: 'Collections', icon: Library },
  { href: PEOPLE_URL, label: 'People', icon: Users },
  { href: SEARCH_URL, label: 'Search', icon: Search },
];

/** How many collections the sidebar lists under Collections before "All collections". */
const SIDEBAR_COLLECTIONS = 6;

export function FullScreenLoader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center">
      <LoreMark className="size-8 animate-pulse text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

function isActive(pathname: string, href: string) {
  return href === HOME_URL ? pathname === HOME_URL : pathname.startsWith(href);
}

export default function AppShell({ children, captureCollectionId }: Props) {
  const router = useRouter();
  const { viewer, isPending } = useViewer();
  const capture = useCapture();
  const online = useOnline();
  const { items: waiting } = useOutbox();
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (!isPending && !viewer) {
      router.replace({ pathname: LOGIN_URL, query: { next: router.asPath } });
    }
  }, [isPending, viewer, router]);

  useLaunchAction(!!viewer, captureCollectionId);

  if (isPending || !viewer) return <FullScreenLoader />;

  return (
    <div className="min-h-[100dvh] md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r px-2.5 py-5 md:flex">
        <Link
          href={HOME_URL}
          className="mb-6 flex items-center gap-2 px-3 font-serif text-2xl font-medium"
        >
          <LoreMark className="size-5" />
          Lore
        </Link>

        {/* One button you can't miss. Writing and photos are a click away, quietly. */}
        <button
          type="button"
          onClick={() => capture.record(captureCollectionId)}
          className="flex h-12 items-center justify-center gap-2.5 rounded-full bg-primary text-[15px] font-medium text-primary-foreground shadow-sm transition-transform hover:opacity-90 active:scale-[0.98]"
        >
          <Mic className="size-[18px]" /> Record
        </button>
        <div className="mb-6 mt-1.5 flex items-center justify-center gap-1 text-[13px] text-muted-foreground">
          <button
            type="button"
            onClick={() => capture.write(captureCollectionId)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
          >
            <PenLine className="size-3.5" /> Write
          </button>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => capture.photos(captureCollectionId)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-accent hover:text-foreground"
          >
            <Camera className="size-3.5" /> Photos
          </button>
        </div>
        {(!online || waiting.length > 0) && (
          <div className="-mt-3 mb-6 px-3 text-center text-xs text-muted-foreground" role="status">
            {!online ? (
              <span className="inline-flex items-center gap-1.5">
                <CloudOff className="size-3.5" /> Offline
                {waiting.length ? ` · ${waiting.length} waiting` : ''}
              </span>
            ) : (
              <Link
                href={`${HOME_URL}#waiting`}
                className="inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <UploadCloud className="size-3.5" /> {waiting.length} waiting to upload
              </Link>
            )}
          </div>
        )}

        <nav className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(router.pathname, href);
            // Inside a collection, its own row is highlighted rather than "Collections".
            const inChild =
              href === COLLECTIONS_URL && router.pathname !== COLLECTIONS_URL && active;
            return (
              <div key={href}>
                <Link
                  href={href}
                  aria-current={active && !inChild ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                    active &&
                      (inChild ? 'text-foreground' : 'bg-accent font-medium text-foreground'),
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
                {href === COLLECTIONS_URL && (
                  <SidebarCollections
                    activeId={inChild ? String(router.query.id ?? '') : undefined}
                  />
                )}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-1.5 pt-3">
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="shadow-2xs flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <UserPlus className="size-4 shrink-0" />
            <span className="truncate">Invite family</span>
          </button>
          <Link
            href={SETTINGS_URL}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
              router.pathname === SETTINGS_URL && 'bg-accent text-foreground',
            )}
          >
            <UserAvatar name={viewer.name} image={viewer.image} className="size-6" />
            <span className="truncate">{viewer.name || 'Settings'}</span>
          </Link>
        </div>
        <QuickInviteDialog open={inviting} onOpenChange={setInviting} />
      </aside>

      {/* Content */}
      <div
        className={cn(
          'min-w-0 flex-1 md:pb-0',
          online
            ? 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
            : 'pb-[calc(8rem+env(safe-area-inset-bottom))]',
        )}
      >
        {children}
      </div>

      {/* Mobile: no signal, but you can still capture. */}
      {!online && (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:hidden"
        >
          <span className="flex items-center gap-1.5 rounded-full border bg-background/95 px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <CloudOff className="size-3.5" />
            Offline — you can still record{waiting.length ? ` · ${waiting.length} waiting` : ''}
          </span>
        </div>
      )}

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center">
          <TabLink
            href={HOME_URL}
            label="Home"
            icon={Home}
            active={isActive(router.pathname, HOME_URL)}
          />
          <TabLink
            href={COLLECTIONS_URL}
            label="Collections"
            icon={Library}
            active={isActive(router.pathname, COLLECTIONS_URL)}
          />
          <div className="flex justify-center">
            <CaptureMenu collectionId={captureCollectionId} />
          </div>
          <TabLink
            href={PEOPLE_URL}
            label="People"
            icon={Users}
            active={isActive(router.pathname, PEOPLE_URL)}
          />
          <TabLink
            href={SETTINGS_URL}
            label="Settings"
            icon={Settings}
            active={isActive(router.pathname, SETTINGS_URL)}
          />
        </div>
      </nav>
    </div>
  );
}

/**
 * Opening the installed app (start_url `/?source=app`) starts a recording,
 * unless you turned that off in Settings. Home-screen shortcuts ask for one
 * flow with `?capture=record|write|vibe`. Runs once, then tidies the URL.
 */
function useLaunchAction(ready: boolean, collectionId?: string) {
  const router = useRouter();
  const capture = useCapture();
  const handled = useRef(false);
  useEffect(() => {
    if (!ready || !router.isReady || handled.current) return;
    const { source, capture: wanted, ...rest } = router.query;
    if (!source && !wanted) return;
    handled.current = true;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    if (wanted === 'write') capture.write(collectionId);
    else if (wanted === 'vibe') capture.vibe(collectionId);
    else if (wanted === 'record' || (source === 'app' && readOpenToRecord()))
      capture.record(collectionId);
  }, [ready, router, capture, collectionId]);
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center gap-1 text-[11px] text-muted-foreground',
        active && 'text-foreground',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className={cn('size-5', active && 'stroke-[2.25]')} />
      {label}
    </Link>
  );
}

/** Your collections under "Collections", so a collection page is one click away. */
function SidebarCollections({ activeId }: { activeId?: string }) {
  const { data } = trpc.collections.list.useQuery();
  const [inviting, setInviting] = useState(false);
  if (!data?.length) return null;
  const shown = data.slice(0, SIDEBAR_COLLECTIONS);
  return (
    <>
      <ul className="mb-1 ml-[1.15rem] mt-0.5 flex flex-col gap-px border-l pl-2.5">
        {shown.map((c) => (
          <li key={c.id}>
            <Link
              href={collectionUrl(c.id)}
              aria-current={c.id === activeId ? 'page' : undefined}
              className={cn(
                'block truncate rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                c.id === activeId && 'bg-accent font-medium text-foreground',
              )}
            >
              {c.name}
            </Link>
          </li>
        ))}
        {data.length > shown.length && (
          <li>
            <Link
              href={COLLECTIONS_URL}
              className="block rounded-md px-2.5 py-1.5 text-[13px] text-muted-foreground/80 hover:bg-accent hover:text-foreground"
            >
              All {data.length} collections
            </Link>
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => setInviting(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[13px] text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
          >
            <UserPlus className="size-3.5" /> Invite family…
          </button>
        </li>
      </ul>
      <QuickInviteDialog open={inviting} onOpenChange={setInviting} />
    </>
  );
}
