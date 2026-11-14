/** Landing page for an invite link: who invited you to what, then one button. */
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { HOME_URL, LOGIN_URL, SIGNUP_URL, collectionUrl } from '@/constants/pages';
import { useSession } from '@/lib/auth/client';
import { setInviteCookie } from '@/lib/client/invite';
import { trpc } from '@/lib/client/trpc';
import { AuthFrame } from '@/screens/Auth';
import { FullScreenLoader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';

interface Props {
  token: string;
}

const ROLE_COPY = {
  owner: 'add and see memories',
  contributor: 'add and see memories',
  viewer: 'see memories and leave comments',
} as const;

export default function InviteScreen({ token }: Props) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const preview = trpc.invites.preview.useQuery({ token }, { enabled: !isPending });
  const accept = trpc.invites.accept.useMutation({
    onSuccess: ({ collectionId }) => router.replace(collectionUrl(collectionId)),
  });

  useEffect(() => {
    setInviteCookie(token);
  }, [token]);

  if (isPending || preview.isPending) return <FullScreenLoader />;
  const data = preview.data;

  if (!data || data.status === 'invalid') {
    return (
      <AuthFrame title="This invite link isn’t valid">
        <p className="text-muted-foreground">
          Check you copied the whole link, or ask for a new one.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href={HOME_URL}>Go to Lore</Link>
        </Button>
      </AuthFrame>
    );
  }

  if (data.status === 'member' && data.collectionId) {
    return (
      <AuthFrame title={`You’re already in “${data.collectionName}”`}>
        <Button asChild className="h-11 w-full rounded-xl">
          <Link href={collectionUrl(data.collectionId)}>Open it</Link>
        </Button>
      </AuthFrame>
    );
  }

  if (data.status !== 'valid') {
    const reason =
      data.status === 'used'
        ? 'has already been used'
        : data.status === 'expired'
          ? 'has expired'
          : 'was cancelled';
    return (
      <AuthFrame title={`This invite ${reason}`}>
        <p className="text-muted-foreground">
          Ask {data.inviterName} to send you a new link to “{data.collectionName}”.
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title={`${data.inviterName} invited you to “${data.collectionName}”`}>
      <p className="text-muted-foreground">
        Join to {ROLE_COPY[data.role]} together. Only the people in this collection can see what’s
        in it.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        {session ? (
          <>
            <Button
              className="h-11 rounded-xl"
              onClick={() => accept.mutate({ token })}
              disabled={accept.isPending}
            >
              {accept.isPending && <Loader2 className="animate-spin" />}
              Join as {session.user.name || session.user.email}
            </Button>
            {accept.error && <p className="text-sm text-destructive">{accept.error.message}</p>}
          </>
        ) : (
          <>
            <Button asChild className="h-11 rounded-xl">
              <Link href={{ pathname: SIGNUP_URL, query: { invite: token } }}>
                Create an account
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <Link href={{ pathname: LOGIN_URL, query: { invite: token } }}>
                I already have one
              </Link>
            </Button>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
