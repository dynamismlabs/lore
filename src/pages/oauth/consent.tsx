import { useState } from 'react';
import { Check, Loader2, MessageSquarePlus, Search, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/router';
import { LOGIN_URL } from '@/constants/pages';
import { useSession } from '@/lib/auth/client';
import { trpc } from '@/lib/client/trpc';
import { AuthFrame } from '@/screens/Auth';
import { FullScreenLoader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';

/** "Allow ChatGPT to use your Lore?" — shown for every new MCP connection. */
export default function ConsentPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const consentCode =
    typeof router.query.consent_code === 'string' ? router.query.consent_code : '';
  const clientId = typeof router.query.client_id === 'string' ? router.query.client_id : '';
  const client = trpc.connections.client.useQuery(
    { clientId },
    { enabled: !!session && !!clientId },
  );
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!router.isReady || isPending) return <FullScreenLoader />;
  if (!session) {
    router.replace({ pathname: LOGIN_URL, query: { next: router.asPath } });
    return <FullScreenLoader />;
  }
  if (!consentCode || !clientId || client.error) {
    return (
      <AuthFrame title="This connection request isn’t valid">
        <p className="text-muted-foreground">Start connecting again from the app you were using.</p>
      </AuthFrame>
    );
  }

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'allow' : 'deny');
    setError(null);
    try {
      const res = await fetch('/api/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept, consent_code: consentCode }),
      });
      const body = (await res.json().catch(() => null)) as {
        redirectURI?: string;
        message?: string;
      } | null;
      if (!res.ok || !body?.redirectURI)
        throw new Error(body?.message ?? 'That request expired — try again');
      window.location.href = body.redirectURI;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(null);
    }
  };

  const name = client.data?.name ?? '…';
  return (
    <AuthFrame title={`Connect ${name} to your Lore?`}>
      {client.data?.redirectHost && (
        <p className="-mt-4 mb-6 text-sm text-muted-foreground">
          Requested by {client.data.redirectHost}
        </p>
      )}
      <ul className="flex flex-col gap-3 text-[15px]">
        <li className="flex gap-3">
          <Search className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          Search and read the memories you can see, in every collection you’re in.
        </li>
        <li className="flex gap-3">
          <MessageSquarePlus className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          Save new memories and comments as you.
        </li>
        <li className="flex gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          It can’t delete anything, and you can disconnect it any time in Settings.
        </li>
      </ul>
      {error && <p className="mt-6 text-sm text-destructive">{error}</p>}
      <div className="mt-8 flex flex-col gap-3">
        <Button
          className="h-11 rounded-xl"
          disabled={!!busy || !client.data}
          onClick={() => respond(true)}
        >
          {busy === 'allow' ? <Loader2 className="animate-spin" /> : <Check />}
          Allow
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          disabled={!!busy}
          onClick={() => respond(false)}
        >
          {busy === 'deny' && <Loader2 className="animate-spin" />}
          Cancel
        </Button>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Signed in as {session.user.email}</p>
    </AuthFrame>
  );
}
