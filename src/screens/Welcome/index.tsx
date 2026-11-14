/** Signed-out landing: what Lore is, in one screen. */
import { Lock, Mic, Users } from 'lucide-react';
import Link from 'next/link';
import { LOGIN_URL, SIGNUP_URL } from '@/constants/pages';
import { trpc } from '@/lib/client/trpc';
import LoreMark from '@/components/LoreMark';
import { Button } from '@/components/ui/button';

export default function WelcomeScreen() {
  const { data: caps } = trpc.me.capabilities.useQuery();
  const canSignUp = caps?.isFirstAccount || caps?.signupMode === 'open';

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 font-serif text-2xl font-medium">
        <LoreMark className="size-5" />
        Lore
      </div>
      <div className="flex flex-1 flex-col justify-center py-12">
        <h1 className="font-serif text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
          Keep the little things.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Say it, write it, or snap it — Lore keeps your family’s memories in one private place, and
          lets the people you love add theirs.
        </p>
        <ul className="mt-8 flex flex-col gap-3 text-[15px]">
          <li className="flex items-center gap-3">
            <Mic className="size-5 text-muted-foreground" /> One tap to record. It writes down what
            you said.
          </li>
          <li className="flex items-center gap-3">
            <Users className="size-5 text-muted-foreground" /> Share a collection with family;
            everyone adds to it.
          </li>
          <li className="flex items-center gap-3">
            <Lock className="size-5 text-muted-foreground" /> Private by default. Photos are never
            public links.
          </li>
        </ul>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          {caps?.isFirstAccount ? (
            <Button asChild size="lg" className="h-12 rounded-xl text-base">
              <Link href={SIGNUP_URL}>Create the first account</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg" className="h-12 rounded-xl text-base">
                <Link href={LOGIN_URL}>Sign in</Link>
              </Button>
              {canSignUp && (
                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl text-base">
                  <Link href={SIGNUP_URL}>Create an account</Link>
                </Button>
              )}
            </>
          )}
        </div>
        {caps && !canSignUp && (
          <p className="mt-4 text-sm text-muted-foreground">
            New here? Ask whoever runs this Lore to send you an invite link.
          </p>
        )}
      </div>
    </main>
  );
}
