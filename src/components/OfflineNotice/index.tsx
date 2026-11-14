/** In place of a page that needs the server: you're offline, but capturing still works. */
import { CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

export default function OfflineNotice({ className }: Props) {
  return (
    <div className={cn('py-16 text-center', className)}>
      <CloudOff className="mx-auto mb-4 size-6 text-muted-foreground" />
      <p className="font-serif text-2xl">You’re offline</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        This needs a connection. You can still record, write and take photos — they’re kept on this
        device and upload when you’re back.
      </p>
    </div>
  );
}
