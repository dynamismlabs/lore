/**
 * "Waiting to upload" on Home: memories kept on this device until there's a
 * connection (or that the server refused). Retry, save a copy, or discard.
 */
import { format } from 'date-fns';
import {
  Clapperboard,
  CloudOff,
  Download,
  Image as ImageIcon,
  Loader2,
  Mic,
  MoreHorizontal,
  PenLine,
  RotateCcw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { readCachedCollections } from '@/lib/client/device';
import { type OutboxFile, type OutboxItem, describeItem } from '@/lib/client/outbox';
import { cn } from '@/lib/utils';
import { useOnline } from '@/hooks/useOnline';
import { useViewer } from '@/hooks/useViewer';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOutbox, useOutboxProgress } from './OutboxProvider';

interface Props {
  className?: string;
}

const EXTENSIONS: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function download(file: OutboxFile, when: number) {
  const type = file.blob.type.split(';')[0];
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lore-${format(when, 'yyyy-MM-dd-HHmm')}.${EXTENSIONS[type] ?? 'bin'}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PendingUploads({ className }: Props) {
  const { items } = useOutbox();
  const online = useOnline();
  const { viewer } = useViewer();
  if (!items.length) return null;
  const collections =
    readCachedCollections<{ id: string; name: string; isDefault: boolean }[]>(viewer?.id) ?? [];
  const failed = items.filter((item) => item.error).length;

  return (
    <section
      id="waiting"
      aria-label="Waiting to upload"
      className={cn('scroll-mt-6 rounded-2xl border', className)}
    >
      <header className="flex items-center gap-2 px-4 pb-1 pt-3.5 text-sm">
        {online ? <UploadCloud className="size-4" /> : <CloudOff className="size-4" />}
        <h2 className="font-medium">
          {items.length === 1 ? '1 memory' : `${items.length} memories`} waiting to upload
        </h2>
      </header>
      <p className="px-4 text-xs text-muted-foreground">
        {failed
          ? 'Kept on this device. Some need you to try again.'
          : online
            ? 'Kept on this device. Uploading by itself.'
            : 'Kept on this device. They’ll upload when you’re back online.'}
      </p>
      <ul className="mt-2 divide-y border-t">
        {items.map((item) => (
          <Row
            key={item.id}
            item={item}
            online={online}
            collection={collections.find((c) => c.id === item.collectionId)}
          />
        ))}
      </ul>
    </section>
  );
}

function Row({
  item,
  online,
  collection,
}: {
  item: OutboxItem;
  online: boolean;
  collection?: { name: string; isDefault: boolean };
}) {
  const { retry, discard } = useOutbox();
  const progress = useOutboxProgress()[item.id];
  const files = item.media.filter((m): m is OutboxFile => m.kind !== 'text');
  const text = item.media.find((m) => m.kind === 'text');
  const Icon =
    item.kind === 'voice'
      ? Mic
      : item.kind === 'vibe'
        ? Clapperboard
        : files.length
          ? ImageIcon
          : PenLine;
  const sending = progress !== undefined;

  const tryAgain = async () => {
    const result = await retry(item.id);
    if (result?.status === 'failed') toast.error(`Couldn’t upload: ${result.error}`);
    else if (result?.status === 'queued') toast('Still can’t reach Lore — it’ll keep trying');
  };

  const status = sending
    ? `Uploading… ${Math.round(progress * 100)}%`
    : item.error
      ? item.error
      : online
        ? 'Waiting to try again'
        : 'Waiting for a connection';

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-serif text-[1.05rem]">{describeItem(item)}</p>
        <p
          className={cn(
            'truncate text-xs text-muted-foreground',
            item.error && !sending && 'text-destructive',
          )}
        >
          {format(item.createdAt, 'EEE h:mm a')}
          {collection && !collection.isDefault ? ` · ${collection.name}` : ''} · {status}
        </p>
      </div>
      {sending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        item.error && (
          <Button size="sm" variant="outline" className="rounded-full" onClick={tryAgain}>
            <RotateCcw /> Retry
          </Button>
        )
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="-mr-2 shrink-0" aria-label="Options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!item.error && (
            <DropdownMenuItem disabled={sending || !online} onSelect={tryAgain}>
              <RotateCcw /> Try now
            </DropdownMenuItem>
          )}
          {files.length === 1 && (
            <DropdownMenuItem onSelect={() => download(files[0], item.createdAt)}>
              <Download /> Save a copy
            </DropdownMenuItem>
          )}
          {text?.kind === 'text' && (
            <DropdownMenuItem
              onSelect={() =>
                navigator.clipboard
                  .writeText(text.text)
                  .then(() => toast('Copied'))
                  .catch(() => toast.error('Couldn’t copy'))
              }
            >
              <PenLine /> Copy the text
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            disabled={sending}
            onSelect={() => {
              if (
                window.confirm(
                  `Discard “${describeItem(item)}”? It hasn’t been uploaded, so it’ll be gone.`,
                )
              ) {
                discard(item.id).catch(() => toast.error('Couldn’t discard it'));
              }
            }}
          >
            <Trash2 /> Discard
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
