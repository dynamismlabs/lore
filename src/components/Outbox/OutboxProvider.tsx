/**
 * Sends what's waiting in the outbox (`@/lib/client/outbox`): when the app
 * opens, when the connection comes back, when you return to the tab, and every
 * little while. Capture flows call `useOutbox().save()`, which keeps the memory
 * on this device first and then tries to upload it straight away.
 */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { TRPCClient } from '@trpc/client';
import { toast } from 'sonner';
import { v7 as uuidv7 } from 'uuid';
import {
  type NewOutboxItem,
  type OutboxItem,
  type SendResult,
  addItem,
  backoffMs,
  errorMessage,
  getItem,
  isRetryable,
  listItems,
  removeItem,
  sendItem,
  subscribeOutbox,
  updateItem,
  withItemLock,
} from '@/lib/client/outbox';
import { trpc } from '@/lib/client/trpc';
import { useViewer } from '@/hooks/useViewer';
import type { AppRouter } from '@/server/trpc/root';

export type OutboxDraft = Omit<NewOutboxItem, 'id' | 'userId'>;

export type SaveResult =
  | ({ status: 'saved' } & SendResult)
  /** Kept on this device; it uploads when there's a connection. */
  | { status: 'queued'; id: string }
  /** The server refused it. Kept on this device until you retry or discard it. */
  | { status: 'failed'; id: string; error: string };

interface SaveOptions {
  onProgress?: (fraction: number) => void;
  /** Called once the memory is safely on this device (before it uploads). */
  onKept?: (id: string) => void;
}

interface OutboxApi {
  /** This account's memories waiting on this device, oldest first. */
  items: OutboxItem[];
  save: (draft: OutboxDraft, options?: SaveOptions) => Promise<SaveResult>;
  retry: (id: string) => Promise<SaveResult | null>;
  discard: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  /** You closed the capture screen mid-upload: say something when it lands. */
  detach: (id: string) => void;
}

const OutboxContext = createContext<OutboxApi | null>(null);

export function useOutbox() {
  const api = useContext(OutboxContext);
  if (!api) throw new Error('useOutbox must be used inside OutboxProvider');
  return api;
}

const POLL_MS = 15_000;
type Client = TRPCClient<AppRouter>;

/** The sending loop lives outside React so effects and screens can share it. */
function createEngine() {
  let client: Client | null = null;
  let userId: string | null = null;
  let afterSave: (results: SendResult[], background: boolean) => void = () => {};
  const inFlight = new Set<string>();
  const detached = new Set<string>();
  let progress: Record<string, number> = {};
  const progressListeners = new Set<() => void>();
  let flushing: Promise<void> | null = null;

  const setProgress = (id: string, fraction: number | null) => {
    const next = { ...progress };
    if (fraction === null) delete next[id];
    else next[id] = fraction;
    progress = next;
    progressListeners.forEach((listener) => listener());
  };

  async function send(
    item: OutboxItem,
    onProgress?: (fraction: number) => void,
  ): Promise<SaveResult | 'busy'> {
    if (!client || inFlight.has(item.id)) return 'busy';
    // Never upload one account's memory with another account's session.
    if (item.userId !== userId) return 'busy';
    const api = client;
    inFlight.add(item.id);
    setProgress(item.id, 0);
    try {
      return await withItemLock(item.id, async (): Promise<SaveResult> => {
        try {
          const result = await sendItem(item, api, (fraction) => {
            setProgress(item.id, fraction);
            onProgress?.(fraction);
          });
          return { status: 'saved', ...result };
        } catch (error) {
          if (isRetryable(error)) {
            const attempts = item.attempts + 1;
            await updateItem(item.id, {
              attempts,
              nextAttemptAt: Date.now() + backoffMs(attempts),
            }).catch(() => {});
            return { status: 'queued', id: item.id };
          }
          const message = errorMessage(error);
          await updateItem(item.id, { error: message }).catch(() => {});
          return { status: 'failed', id: item.id, error: message };
        }
      });
    } finally {
      inFlight.delete(item.id);
      setProgress(item.id, null);
    }
  }

  /** Send everything that's due, oldest first. Stops at the first connection problem. */
  function flush({ force = false } = {}): Promise<void> {
    if (flushing) return flushing;
    if (!client || !userId || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return Promise.resolve();
    }
    const owner = userId;
    flushing = (async () => {
      const items = await listItems(owner).catch(() => [] as OutboxItem[]);
      const saved: SendResult[] = [];
      for (const item of items) {
        if (item.error || inFlight.has(item.id)) continue;
        if (!force && item.nextAttemptAt && item.nextAttemptAt > Date.now()) continue;
        const result = await send(item);
        if (result === 'busy') continue;
        if (result.status === 'saved') saved.push(result);
        if (result.status === 'queued') break;
      }
      if (saved.length) afterSave(saved, true);
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  return {
    configure(next: { client: Client; userId: string | null; afterSave: typeof afterSave }) {
      client = next.client;
      userId = next.userId;
      afterSave = next.afterSave;
    },
    flush,
    async save(draft: OutboxDraft, { onProgress, onKept }: SaveOptions = {}): Promise<SaveResult> {
      if (!client || !userId) throw new Error('Please sign in again');
      const item: NewOutboxItem = { ...draft, id: uuidv7(), userId };
      let kept: OutboxItem;
      try {
        kept = await addItem(item);
      } catch (error) {
        // No IndexedDB here (some private modes): upload directly, as before.
        console.warn('[outbox] couldn’t keep it on this device', error);
        const result = await sendItem(
          { ...item, createdAt: Date.now(), uploaded: {}, attempts: 0 },
          client,
          onProgress,
        );
        afterSave([result], false);
        return { status: 'saved', ...result };
      }
      onKept?.(kept.id);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        keepForGood();
        return { status: 'queued', id: kept.id };
      }
      const result = await send(kept, onProgress);
      if (result === 'busy') return { status: 'queued', id: kept.id };
      if (result.status === 'saved') afterSave([result], detached.delete(kept.id));
      if (result.status === 'queued') keepForGood();
      return result;
    },
    async retry(id: string): Promise<SaveResult | null> {
      const item = await getItem(id);
      if (!item) return null;
      await updateItem(id, { error: undefined, nextAttemptAt: undefined });
      const result = await send({ ...item, error: undefined });
      if (result === 'busy') return null;
      if (result.status === 'saved') afterSave([result], true);
      return result;
    },
    discard: (id: string) => removeItem(id),
    async rename(id: string, title: string) {
      await updateItem(id, { title: title.trim() || undefined });
    },
    detach(id: string) {
      if (inFlight.has(id)) detached.add(id);
    },
    subscribeProgress(listener: () => void) {
      progressListeners.add(listener);
      return () => {
        progressListeners.delete(listener);
      };
    },
    getProgress: () => progress,
  };
}

/** Ask the browser not to clear our storage when space runs low (home-screen apps usually get it). */
function keepForGood() {
  navigator.storage?.persist?.().catch(() => {});
}

type Engine = ReturnType<typeof createEngine>;
const ProgressContext = createContext<Engine | null>(null);

/** Upload progress (0–1) of the memories being sent right now, by outbox id. */
export function useOutboxProgress(): Record<string, number> {
  const engine = useContext(ProgressContext);
  return useSyncExternalStore(
    (listener) => engine?.subscribeProgress(listener) ?? (() => {}),
    () => engine?.getProgress() ?? EMPTY,
    () => EMPTY,
  );
}
const EMPTY: Record<string, number> = {};

interface Props {
  children: React.ReactNode;
}

export default function OutboxProvider({ children }: Props) {
  const utils = trpc.useUtils();
  const { viewer } = useViewer();
  const userId = viewer?.id ?? null;
  const [engine] = useState(createEngine);
  const [loaded, setLoaded] = useState<{ userId: string; items: OutboxItem[] } | null>(null);

  // Keep the engine pointed at the current account and client.
  useEffect(() => {
    engine.configure({
      client: utils.client,
      userId,
      afterSave: (results, background) => {
        utils.stories.invalidate();
        utils.collections.invalidate();
        if (!background) return;
        const moved = results.filter((r) => r.movedToMoments).length;
        toast.success(
          results.length === 1
            ? `Uploaded “${results[0].label}”`
            : `${results.length} memories uploaded`,
          moved
            ? {
                description:
                  moved === 1
                    ? 'Its collection was gone, so it’s in Personal.'
                    : `${moved} went to Personal because their collection was gone.`,
              }
            : undefined,
        );
      },
    });
    engine.flush();
  }, [engine, utils, userId]);

  // What's waiting, for this account.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () =>
      listItems(userId)
        .then((items) => {
          if (!cancelled) setLoaded({ userId, items });
        })
        .catch(() => {});
    load();
    const unsubscribe = subscribeOutbox(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  // When to try again.
  useEffect(() => {
    const onOnline = () => engine.flush({ force: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') engine.flush();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => engine.flush(), POLL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [engine]);

  const items = loaded && loaded.userId === userId ? loaded.items : NO_ITEMS;
  const [api] = useState<Omit<OutboxApi, 'items'>>(() => ({
    save: engine.save,
    retry: engine.retry,
    discard: engine.discard,
    rename: engine.rename,
    detach: engine.detach,
  }));

  return (
    <ProgressContext.Provider value={engine}>
      <OutboxContext.Provider value={{ ...api, items }}>{children}</OutboxContext.Provider>
    </ProgressContext.Provider>
  );
}
const NO_ITEMS: OutboxItem[] = [];
