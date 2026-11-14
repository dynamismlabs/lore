/** Sign in / create account. Handles invite links and redirects back to `next`. */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  FORGOT_PASSWORD_URL,
  HOME_URL,
  LOGIN_URL,
  SIGNUP_URL,
  collectionUrl,
  safeNext,
} from '@/constants/pages';
import { signIn, signUp, useSession } from '@/lib/auth/client';
import { setInviteCookie } from '@/lib/client/invite';
import { trpc } from '@/lib/client/trpc';
import { LoreWordmark } from '@/components/LoreMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  mode: 'login' | 'signup';
}

export default function AuthScreen({ mode }: Props) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { data: caps } = trpc.me.capabilities.useQuery();
  const acceptInvite = trpc.invites.accept.useMutation();
  const invite = typeof router.query.invite === 'string' ? router.query.invite : undefined;
  const next = safeNext(router.query.next);
  // Signing in to connect an app (ChatGPT, Ri…): the authorize endpoint sent us
  // here with its OAuth parameters; send them back once signed in.
  const isOAuth = mode === 'login' && !!router.query.client_id && !!router.query.response_type;
  const resumeOAuth = () => {
    // A real navigation to the OAuth endpoint (an API route), not a page transition.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `${window.location.origin}/api/auth/mcp/authorize${window.location.search}`,
    );
  };

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (invite) setInviteCookie(invite);
  }, [invite]);

  const finish = async () => {
    if (isOAuth) {
      resumeOAuth();
      return;
    }
    if (invite) {
      try {
        const { collectionId } = await acceptInvite.mutateAsync({ token: invite });
        await router.replace(collectionUrl(collectionId));
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Couldn’t accept the invite');
      }
    }
    await router.replace(next);
  };

  // Already signed in (e.g. came back from Google, or opened /login by accident).
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (isPending || !session || submitting || redirectedRef.current) return;
    redirectedRef.current = true;
    if (isOAuth) {
      resumeOAuth();
    } else if (invite) {
      acceptInvite.mutate(
        { token: invite },
        {
          onSuccess: ({ collectionId }) => router.replace(collectionUrl(collectionId)),
          onError: () => router.replace(next),
        },
      );
    } else {
      router.replace(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, session, submitting, invite, next, router, acceptInvite]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const result = await signUp.email({ name: name.trim(), email: email.trim(), password });
        if (result.error) throw new Error(result.error.message ?? 'Couldn’t create your account');
        if (!result.data?.token) {
          setCheckEmail(true);
          return;
        }
      } else {
        const result = await signIn.email({ email: email.trim(), password });
        if (result.error) {
          throw new Error(
            result.error.status === 401
              ? 'That email and password don’t match.'
              : result.error.message,
          );
        }
      }
      await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const google = () =>
    signIn.social({
      provider: 'google',
      callbackURL: invite ? `${SIGNUP_URL}?invite=${encodeURIComponent(invite)}` : next,
    });

  const inviteOnly =
    mode === 'signup' && caps && !caps.isFirstAccount && caps.signupMode === 'invite' && !invite;
  const otherHref = {
    pathname: mode === 'login' ? SIGNUP_URL : LOGIN_URL,
    query: { ...(invite ? { invite } : {}), ...(router.query.next ? { next } : {}) },
  };

  if (checkEmail) {
    return (
      <AuthFrame title="Check your email">
        <p className="text-muted-foreground">
          We sent a link to <span className="text-foreground">{email}</span>. Open it to finish
          setting up your account.
        </p>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={
        mode === 'login'
          ? 'Welcome back'
          : caps?.isFirstAccount
            ? 'Create the first account'
            : 'Create your account'
      }
      subtitle={
        isOAuth
          ? 'Sign in to connect an app to your Lore. You’ll choose what to allow next.'
          : mode === 'signup' && caps?.isFirstAccount
            ? 'You’re setting up this Lore. Invite your family once you’re in.'
            : invite
              ? 'You’ll join the collection you were invited to.'
              : undefined
      }
    >
      {inviteOnly ? (
        <div className="rounded-xl border p-4 text-sm text-muted-foreground">
          This Lore is invite-only. Ask someone who uses it to send you an invite link, then open it
          on this device.
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'signup' && (
            <div className="grid gap-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="What your family calls you"
                required
                className="h-11"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="h-11"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === 'login' && caps?.email && (
                <Link
                  href={FORGOT_PASSWORD_URL}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Forgot?
                </Link>
              )}
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              required
              className="h-11"
            />
            {mode === 'signup' && (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 rounded-xl" disabled={submitting}>
            {submitting && <Loader2 className="animate-spin" />}
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </Button>
          {caps?.google && (
            <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={google}>
              Continue with Google
            </Button>
          )}
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          caps && (caps.signupMode === 'open' || caps.isFirstAccount || invite) ? (
            <>
              New to Lore?{' '}
              <Link href={otherHref} className="text-foreground underline-offset-4 hover:underline">
                Create an account
              </Link>
            </>
          ) : null
        ) : (
          <>
            Already have an account?{' '}
            <Link href={otherHref} className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </AuthFrame>
  );
}

export function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
      <Link href={HOME_URL} className="flex items-center self-start">
        <LoreWordmark className="text-2xl" />
      </Link>
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
