import { useEffect, useState } from 'react';
import { History, Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { SEARCH_URL, TIMELINE_URL } from '@/constants/pages';
import { resolveDefaultCollectionId, writeCachedCollections } from '@/lib/client/device';
import { trpc } from '@/lib/client/trpc';
import { useViewer } from '@/hooks/useViewer';
import AppShell from '@/components/AppShell';
import CaptureBar from '@/components/CaptureBar';
import InstallCard from '@/components/InstallCard';
import MemoryFeed from '@/components/MemoryFeed';
import PendingUploads from '@/components/Outbox/PendingUploads';
import QuickInviteDialog from '@/components/QuickInviteDialog';
import VibesStrip from '@/components/VibesStrip';
import { Button } from '@/components/ui/button';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const { viewer } = useViewer();
  const firstName = viewer?.name?.split(' ')[0];
  const { data: collections } = trpc.collections.list.useQuery();
  const [inviting, setInviting] = useState(false);

  const writable = collections
    ?.filter((c) => c.role === 'owner' || c.role === 'contributor')
    .sort((a, b) => (a.isDefault === b.isDefault ? 0 : a.isDefault ? 1 : -1));

  useEffect(() => {
    if (viewer?.id && writable?.length) {
      writeCachedCollections(
        viewer.id,
        writable.map((c) => ({ id: c.id, name: c.name, isDefault: c.isDefault, role: c.role })),
      );
    }
  }, [viewer?.id, writable]);

  const defaultCollectionId = resolveDefaultCollectionId(viewer?.id, writable);
  const defaultCollection = writable?.find((c) => c.id === defaultCollectionId);
  const soloSoFar = !!collections && collections.every((c) => c.memberCount <= 1);

  return (
    <AppShell captureCollectionId={defaultCollectionId}>
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 sm:px-6">
        <header className="flex items-center justify-between pb-5 pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-10">
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full text-xs"
              onClick={() => setInviting(true)}
            >
              <UserPlus className="size-3.5" /> Invite
            </Button>
            <div className="flex md:hidden">
              <Button variant="ghost" size="icon" asChild>
                <Link href={TIMELINE_URL} aria-label="Timeline">
                  <History className="size-5" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild>
                <Link href={SEARCH_URL} aria-label="Search">
                  <Search className="size-5" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <VibesStrip collectionId={defaultCollectionId} className="mb-7" />

        {/* The ways in stay front and centre, above what you've already kept. */}
        <CaptureBar collectionId={defaultCollectionId} className="mb-10" />

        <PendingUploads className="-mt-4 mb-10" />
        <InstallCard className="-mt-4 mb-10" />

        {soloSoFar && (
          <div className="mb-10 flex flex-col items-start justify-between gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center">
            <div className="text-sm">
              <p className="font-medium">Bring your partner or family in</p>
              <p className="text-muted-foreground">
                Send an invite link so everything you both capture is shared automatically.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => setInviting(true)}
            >
              <UserPlus className="size-4" /> Invite someone
            </Button>
          </div>
        )}

        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent</h2>
        <MemoryFeed
          filters={{ sort: 'recent' }}
          empty={
            <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
              <p className="font-serif text-xl">Your memories will live here.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                Tap Record and say what happened today — a funny thing the kids said, a story worth
                keeping.{' '}
                {defaultCollection && !defaultCollection.isDefault
                  ? `It saves directly to “${defaultCollection.name}” so everyone in it can see it.`
                  : 'Once you invite your family, everything you capture here is shared with them by default.'}
              </p>
            </div>
          }
        />
      </main>
      <QuickInviteDialog open={inviting} onOpenChange={setInviting} />
    </AppShell>
  );
}
