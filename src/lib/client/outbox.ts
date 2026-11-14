/**
 * The outbox: every memory you capture is written to this device (IndexedDB)
 * before it uploads, so no signal, a closed tab or a flat battery mid-upload
 * never loses it. `OutboxProvider` sends whatever is waiting whenever we're
 * online. The item's id becomes the story's id, so a retry after a lost
 * response can't save the same memory twice.
 */
import { type TRPCClient, TRPCClientError } from '@trpc/client';
import type { Memory } from '@/lib/client/trpc';
import { UploadError, uploadFile } from '@/lib/client/upload';
import type { AppRouter } from '@/server/trpc/root';

export type OutboxFile = {
  kind: 'audio' | 'image' | 'video';
  blob: Blob;
  width?: number;
  height?: number;
  durationMs?: number;
};
export type OutboxMedia = { kind: 'text'; text: string } | OutboxFile;

export interface OutboxItem {
  /** Also the story id once it's created. */
  id: string;
  /** Only this account uploads it (a shared phone can have several). */
  userId: string;
  kind: 'voice' | 'write' | 'vibe';
  createdAt: number;
  collectionId?: string;
  title?: string;
  occurredAt: number;
  format?: 'second';
  media: OutboxMedia[];
  /** Storage keys of files already uploaded, by media index, so a retry skips them. */
  uploaded: Record<number, string>;
  /** A vibe replaces your other clips from the same day: [from, to) in ms. */
  replaceDay?: { from: number; to: number };
  attempts: number;
  nextAttemptAt?: number;
  /** The server refused it (not a connection problem): waits for you to retry or discard. */
  error?: string;
}

export type NewOutboxItem = Omit<OutboxItem, 'createdAt' | 'uploaded' | 'attempts'>;

const DB_NAME = 'lore-outbox';
const STORE = 'items';
const CHANNEL = 'lore-outbox';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('This browser can’t keep memories offline'));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrading the database: let it, and reopen next time.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error ?? new Error('Couldn’t open the outbox'));
      request.onblocked = () => reject(new Error('The outbox is busy in another tab'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request ? request.result : (undefined as T));
    tx.onerror = () => reject(tx.error ?? new Error('Outbox write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Outbox write was cancelled'));
  });
}

// ---------- Change notifications (this tab and others) ----------

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function getChannel() {
  if (!channel && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => listeners.forEach((listener) => listener());
  }
  return channel;
}

function notify() {
  listeners.forEach((listener) => listener());
  getChannel()?.postMessage('changed');
}

export function subscribeOutbox(listener: () => void) {
  getChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---------- Reads and writes ----------

export async function addItem(item: NewOutboxItem): Promise<OutboxItem> {
  const full: OutboxItem = { ...item, createdAt: Date.now(), uploaded: {}, attempts: 0 };
  await run('readwrite', (store) => store.put(full));
  notify();
  return full;
}

export async function listItems(userId: string): Promise<OutboxItem[]> {
  const all = await run<OutboxItem[]>('readonly', (store) => store.getAll());
  return all.filter((item) => item.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getItem(id: string): Promise<OutboxItem | undefined> {
  return run<OutboxItem | undefined>('readonly', (store) => store.get(id));
}

export async function updateItem(id: string, patch: Partial<OutboxItem>): Promise<void> {
  const current = await getItem(id);
  if (!current) return;
  await run('readwrite', (store) => store.put({ ...current, ...patch, id }));
  notify();
}

export async function removeItem(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
  notify();
}

/** How many memories are waiting for this account on this device (0 if we can't tell). */
export async function countItems(userId: string): Promise<number> {
  return listItems(userId)
    .then((items) => items.length)
    .catch(() => 0);
}

// ---------- Sending ----------

const RETRY_STATUSES = new Set([401, 408, 425, 429]);

/** Connection trouble (try again later) vs. the server saying no (needs you). */
export function isRetryable(error: unknown): boolean {
  if (error instanceof UploadError) {
    return error.status === 0 || error.status >= 500 || RETRY_STATUSES.has(error.status);
  }
  if (error instanceof TRPCClientError) {
    const status = (error.data as { httpStatus?: number } | undefined)?.httpStatus;
    return !status || status >= 500 || RETRY_STATUSES.has(status);
  }
  // fetch's TypeError ("Failed to fetch"), aborted requests, …
  return true;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

/** Wait after the nth failed attempt: 5s, 10s, 20s … up to 5 minutes. */
export function backoffMs(attempts: number) {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);
}

export interface SendResult {
  story: Memory;
  /** The collection was gone (or you were removed), so it went to Moments. */
  movedToMoments: boolean;
  /** What it was, for a toast ("Voice memory"). */
  label: string;
}

type Client = TRPCClient<AppRouter>;

/**
 * Upload the files that haven't gone up yet, then create the memory. Safe to
 * call again after any failure: uploaded keys are remembered and the create
 * is idempotent. Removes the item from the outbox once it's saved.
 */
export async function sendItem(
  item: OutboxItem,
  client: Client,
  onProgress?: (fraction: number) => void,
): Promise<SendResult> {
  const uploaded = { ...item.uploaded };
  const pending = item.media
    .map((media, index) => ({ media, index }))
    .filter(
      (entry): entry is { media: OutboxFile; index: number } =>
        entry.media.kind !== 'text' && !uploaded[entry.index],
    );
  const total = pending.reduce((sum, { media }) => sum + media.blob.size, 0) || 1;
  let done = 0;
  for (const { media, index } of pending) {
    const result = await uploadFile(media.blob, {
      onProgress: (fraction) => onProgress?.(((done + fraction * media.blob.size) / total) * 0.95),
    });
    uploaded[index] = result.key;
    done += media.blob.size;
    // Remember it straight away: if the next file fails, this one isn't sent again.
    await updateItem(item.id, { uploaded }).catch(() => {});
  }

  const input = {
    clientId: item.id,
    collectionId: item.collectionId,
    title: item.title?.trim() || undefined,
    occurredAt: new Date(item.occurredAt),
    format: item.format,
    media: item.media.map((media, index) =>
      media.kind === 'text'
        ? { kind: 'text' as const, text: media.text }
        : {
            kind: media.kind,
            storageKey: uploaded[index],
            width: media.width,
            height: media.height,
            durationMs: media.durationMs,
          },
    ),
  };

  let story: Memory;
  let movedToMoments = false;
  try {
    story = await client.stories.create.mutate(input);
  } catch (error) {
    const code = error instanceof TRPCClientError ? (error.data as { code?: string })?.code : null;
    if (!item.collectionId || (code !== 'FORBIDDEN' && code !== 'NOT_FOUND')) throw error;
    // The collection went away while this waited. Keep the memory: save it to Moments.
    story = await client.stories.create.mutate({ ...input, collectionId: undefined });
    movedToMoments = true;
  }
  onProgress?.(1);
  await removeItem(item.id).catch(() => {});

  // Best effort from here: the memory is saved either way.
  const audio = story.media.find((m) => m.kind === 'audio' && m.transcriptStatus === 'pending');
  if (audio) {
    client.media.transcribe
      .mutate({ id: audio.id })
      .catch((error) => console.warn('[transcribe]', error));
  }
  if (item.replaceDay) {
    try {
      const clips = await client.stories.seconds.query({
        from: new Date(item.replaceDay.from),
        to: new Date(item.replaceDay.to),
        onlyMine: true,
      });
      for (const clip of clips) {
        if (clip.id !== story.id)
          await client.stories.delete.mutate({ id: clip.id }).catch(() => {});
      }
    } catch (error) {
      console.warn('[outbox] couldn’t replace the old vibe', error);
    }
  }
  return { story, movedToMoments, label: describeItem(item) };
}

/** Run `fn` unless another tab is already sending this item. */
export async function withItemLock<T>(id: string, fn: () => Promise<T>): Promise<T | 'busy'> {
  if (typeof navigator === 'undefined' || !navigator.locks) return fn();
  return navigator.locks.request(`lore-outbox:${id}`, { ifAvailable: true }, async (lock) =>
    lock ? fn() : ('busy' as const),
  );
}

/** One line for a waiting memory: its title, or what it is. */
export function describeItem(item: Pick<OutboxItem, 'title' | 'kind' | 'media'>) {
  if (item.title?.trim()) return item.title.trim();
  if (item.kind === 'vibe') return 'A vibe';
  if (item.kind === 'voice') return 'Voice memory';
  const files = item.media.filter((m) => m.kind !== 'text').length;
  if (files) return files === 1 ? 'A photo' : `${files} photos`;
  return 'Something you wrote';
}
