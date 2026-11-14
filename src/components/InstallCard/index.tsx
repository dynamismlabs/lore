/**
 * A one-time nudge on phones: put Lore on the home screen, where it opens
 * straight to Record and works with no signal. Android/Chrome get a real
 * Install button; iPhones get the two taps it takes in Safari.
 */
import { useState } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import { readInstallDismissed, writeInstallDismissed } from '@/lib/client/device';
import { isPhoneOrTablet, promptInstall, useInstallState } from '@/lib/client/pwa';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Props {
  className?: string;
}

export default function InstallCard({ className }: Props) {
  const install = useInstallState();
  // Home only renders after sign-in resolves (client-side), so reading here is safe.
  const [hidden, setHidden] = useState(() => readInstallDismissed() || !isPhoneOrTablet());
  if (hidden || install.installed || (!install.canPrompt && !install.ios)) return null;

  const dismiss = () => {
    writeInstallDismissed();
    setHidden(true);
  };

  return (
    <section
      aria-label="Install Lore"
      className={cn('relative flex gap-3.5 rounded-2xl border px-4 py-4 pr-10', className)}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">Put Lore on your home screen</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          One tap starts a recording, and it works with no signal.
        </p>
        {install.canPrompt ? (
          <Button
            size="sm"
            className="mt-3 rounded-full"
            onClick={async () => {
              if (await promptInstall()) dismiss();
            }}
          >
            Install
          </Button>
        ) : (
          <p className="mt-2 text-sm">
            Tap <Share className="mx-0.5 inline size-4 align-[-3px]" aria-label="Share" /> then{' '}
            <span className="font-medium">Add to Home Screen</span>.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="absolute right-2 top-2 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
