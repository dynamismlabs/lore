/** Settings › This device: install the app, open-to-Record, and what's waiting to upload. */
import { useState } from 'react';
import { Check, Share, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { HOME_URL } from '@/constants/pages';
import { readOpenToRecord, writeOpenToRecord } from '@/lib/client/device';
import { promptInstall, useInstallState } from '@/lib/client/pwa';
import { useOutbox } from '@/components/Outbox/OutboxProvider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function ThisDevice() {
  const install = useInstallState();
  const { items } = useOutbox();
  // Settings renders after sign-in resolves (client-side), so reading here is safe.
  const [openToRecord, setOpenToRecord] = useState(readOpenToRecord);

  return (
    <section className="mt-10 flex flex-col gap-4">
      <h2 className="text-sm font-medium text-muted-foreground">This device</h2>

      <div className="flex items-start justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium">Lore on your home screen</p>
          <p className="mt-0.5 text-muted-foreground">
            {install.installed
              ? 'Installed. It works with no signal — anything you capture uploads when you’re back.'
              : install.ios
                ? 'In Safari, tap Share, then “Add to Home Screen”.'
                : install.canPrompt
                  ? 'Opens like an app and works with no signal.'
                  : 'Use your browser’s menu to install it or add it to your home screen.'}
          </p>
        </div>
        {install.installed ? (
          <Check className="mt-0.5 size-5 shrink-0" aria-label="Installed" />
        ) : install.canPrompt ? (
          <Button size="sm" className="shrink-0 rounded-full" onClick={() => promptInstall()}>
            Install
          </Button>
        ) : install.ios ? (
          <Share className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-4">
        <Label htmlFor="open-to-record" className="block text-sm font-normal">
          <span className="font-medium">Open straight to Record</span>
          <span className="mt-0.5 block text-muted-foreground">
            Opening Lore from your home screen starts a recording.
          </span>
        </Label>
        <Switch
          id="open-to-record"
          checked={openToRecord}
          onCheckedChange={(on) => {
            setOpenToRecord(on);
            writeOpenToRecord(on);
          }}
          className="mt-0.5"
        />
      </div>

      {items.length > 0 && (
        <Link
          href={`${HOME_URL}#waiting`}
          className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm hover:bg-accent"
        >
          <UploadCloud className="size-4" />
          <span className="flex-1">
            {items.length === 1 ? '1 memory' : `${items.length} memories`} waiting to upload from
            this device
          </span>
        </Link>
      )}
    </section>
  );
}
