import { useState, useSyncExternalStore } from 'react';
import {
  Check,
  Copy,
  FlaskConical,
  Link2,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Share2,
  Sun,
  UserPlus,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { HOME_URL, LABS_URL } from '@/constants/pages';
import { authClient, signOut } from '@/lib/auth/client';
import { clearDeviceCache, writePreferredCollectionId } from '@/lib/client/device';
import { trpc } from '@/lib/client/trpc';
import { cn } from '@/lib/utils';
import AppShell from '@/components/AppShell';
import { useOutbox } from '@/components/Outbox/OutboxProvider';
import PageHeader from '@/components/PageHeader';
import QuickInviteDialog from '@/components/QuickInviteDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import ConnectedApps from './ConnectedApps';
import ThisDevice from './ThisDevice';

export default function SettingsScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: me } = trpc.me.get.useQuery();
  const { data: caps } = trpc.me.capabilities.useQuery();
  const { data: collections } = trpc.collections.list.useQuery();
  const { theme, setTheme } = useTheme();
  const { items: waiting } = useOutbox();
  // Theme is only known in the browser; avoid a hydration mismatch.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [quickLink, setQuickLink] = useState<{ url: string; collectionName: string } | null>(null);
  const [copiedQuick, setCopiedQuick] = useState(false);

  const createCollection = trpc.collections.create.useMutation();
  const createInvite = trpc.invites.create.useMutation();
  const generatingQuick = createCollection.isPending || createInvite.isPending;

  const primaryShared = (collections ?? []).find((c) => !c.isDefault && c.role === 'owner');
  const canNativeShare =
    mounted && typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleInstantInvite = async (shareAfter: boolean) => {
    try {
      let collectionId = primaryShared?.id;
      const collectionName = primaryShared?.name ?? 'Our family';

      if (!collectionId) {
        const created = await createCollection.mutateAsync({
          name: 'Our family',
          description: null,
          includeMoments: true,
        });
        collectionId = created.id;
        if (me?.id) writePreferredCollectionId(me.id, collectionId);
        await utils.collections.invalidate();
        await utils.stories.writableCollections.invalidate();
      }

      const invite = await createInvite.mutateAsync({
        collectionId,
        role: 'contributor',
      });

      setQuickLink({ url: invite.url, collectionName });
      await navigator.clipboard.writeText(invite.url).catch(() => {});
      setCopiedQuick(true);
      toast.success(`Invite link for “${collectionName}” copied`);

      if (shareAfter && canNativeShare) {
        await navigator
          .share({
            title: `Join “${collectionName}” on Lore`,
            text: `I set up Lore for our memories — join “${collectionName}”:`,
            url: invite.url,
          })
          .catch(() => {});
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Couldn’t create invite link');
    }
  };

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-xl px-4 pb-16 sm:px-6 md:pt-8">
        <PageHeader title="Settings" />

        {/* Prominent, ultra-shareable Family Invite card */}
        <section className="shadow-2xs mt-6 rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-xl font-medium">
                Invite your partner, family, or friends
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Send a one-tap invite link to{' '}
                <span className="font-medium text-foreground">
                  “{primaryShared?.name ?? 'Our family'}”
                </span>{' '}
                so they can create their account and share memories with you.
              </p>
            </div>
          </div>

          {quickLink ? (
            <div className="mt-4 flex flex-col gap-2.5 rounded-xl bg-muted/60 p-3.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <Link2 className="size-3.5" /> Invite link for “{quickLink.collectionName}”
                </span>
                <span className="text-muted-foreground">Expires in 14 days</span>
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={quickLink.url}
                  className="bg-background text-xs"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(quickLink.url);
                    setCopiedQuick(true);
                    toast.success('Invite link copied');
                  }}
                >
                  {copiedQuick ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copiedQuick ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {canNativeShare && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      navigator
                        .share({
                          title: `Join “${quickLink.collectionName}” on Lore`,
                          text: `I set up Lore for our memories — join “${quickLink.collectionName}”:`,
                          url: quickLink.url,
                        })
                        .catch(() => {})
                    }
                  >
                    <Share2 className="size-3.5" /> Share link…
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleInstantInvite(false)}
                  disabled={generatingQuick}
                >
                  New link for someone else
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setInviting(true)}
                  className="ml-auto text-muted-foreground"
                >
                  Other collection or role…
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                onClick={() => handleInstantInvite(canNativeShare)}
                disabled={generatingQuick}
                className="rounded-full px-5"
              >
                {generatingQuick ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : canNativeShare ? (
                  <Share2 className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                {canNativeShare ? 'Share invite link' : 'Copy invite link'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviting(true)}
                className="rounded-full px-4"
              >
                <UserPlus className="size-4" /> Choose collection or role…
              </Button>
            </div>
          )}
        </section>

        <section className="mt-10 flex flex-col gap-4">
          <h2 className="text-sm font-medium text-muted-foreground">You</h2>
          {me && <NameForm key={me.id} initialName={me.name} email={me.email} />}
        </section>

        <section className="mt-10 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Appearance</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'Automatic', icon: Monitor },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={mounted && theme === value}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm transition-colors hover:bg-accent',
                  mounted && theme === value && 'border-foreground',
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <ThisDevice />

        <section className="mt-10 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Password</h2>
          <form
            className="flex flex-col gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setChangingPassword(true);
              const result = await authClient.changePassword({
                currentPassword,
                newPassword,
                revokeOtherSessions: true,
              });
              setChangingPassword(false);
              if (result.error)
                toast.error(result.error.message ?? 'Couldn’t change your password');
              else {
                toast.success('Password changed');
                setCurrentPassword('');
                setNewPassword('');
              }
            }}
          >
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
            />
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (8+ characters)"
              minLength={8}
              autoComplete="new-password"
            />
            <Button
              type="submit"
              variant="outline"
              className="self-start"
              disabled={!currentPassword || newPassword.length < 8 || changingPassword}
            >
              {changingPassword && <Loader2 className="animate-spin" />}
              Change password
            </Button>
          </form>
        </section>

        <ConnectedApps />

        {caps && (
          <section className="mt-10 flex flex-col gap-2 text-sm">
            <h2 className="font-medium text-muted-foreground">This Lore</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-muted-foreground">
              <dt>Transcription</dt>
              <dd className="text-foreground">
                {caps.transcription === 'groq'
                  ? 'Groq Whisper'
                  : caps.transcription === 'workers-ai'
                    ? 'Cloudflare Workers AI'
                    : 'Not set up'}
              </dd>
              <dt>Photo & audio storage</dt>
              <dd className="text-foreground">{caps.storage ? 'Private bucket' : 'Not set up'}</dd>
              <dt>Email</dt>
              <dd className="text-foreground">
                {caps.email ? 'On' : 'Off — invites are shared as links'}
              </dd>
              <dt>New accounts</dt>
              <dd className="text-foreground">
                {caps.signupMode === 'open' ? 'Anyone can sign up' : 'Invite only'}
              </dd>
            </dl>
          </section>
        )}

        <Button
          variant="outline"
          className="mt-12 w-full"
          onClick={async () => {
            if (
              waiting.length &&
              !window.confirm(
                `${waiting.length === 1 ? '1 memory hasn’t' : `${waiting.length} memories haven’t`} uploaded yet. ` +
                  'They stay on this device and upload next time you sign in here. Sign out?',
              )
            ) {
              return;
            }
            await signOut();
            clearDeviceCache();
            utils.invalidate();
            router.replace(HOME_URL);
          }}
        >
          <LogOut /> Sign out
        </Button>

        <div className="mt-8 flex justify-center">
          <Link
            href={LABS_URL}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            <FlaskConical className="size-3.5" />
            <span>Labs</span>
          </Link>
        </div>

        <QuickInviteDialog open={inviting} onOpenChange={setInviting} />
      </main>
    </AppShell>
  );
}

function NameForm({ initialName, email }: { initialName: string; email: string }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const updateMe = trpc.me.update.useMutation({
    onSuccess: async ({ name: next }) => {
      setSaved(next);
      // Refresh the cached session so the new name shows everywhere.
      await authClient.getSession({ query: { disableCookieCache: true } });
      utils.invalidate();
      toast.success('Saved');
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) updateMe.mutate({ name: name.trim() });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="settings-name">Name</Label>
        <div className="flex gap-2">
          <Input
            id="settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!name.trim() || name.trim() === saved || updateMe.isPending}
          >
            {updateMe.isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Signed in as {email}</p>
    </form>
  );
}
