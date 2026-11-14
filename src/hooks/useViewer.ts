/**
 * Who's signed in — and, when the server can't be reached, who was signed in
 * on this device last, so Lore still opens (and records) with no signal.
 */
import { useEffect } from 'react';
import { useSession } from '@/lib/auth/client';
import { type CachedViewer, readCachedViewer, writeCachedViewer } from '@/lib/client/device';

export interface ViewerState {
  viewer: CachedViewer | null;
  isPending: boolean;
  /** Signed in from this device's memory because the server couldn't be reached. */
  offline: boolean;
}

export function useViewer(): ViewerState {
  const { data, isPending, error } = useSession();
  const id = data?.user.id;
  const name = data?.user.name ?? '';
  const image = data?.user.image ?? null;

  useEffect(() => {
    if (id) writeCachedViewer({ id, name, image });
  }, [id, name, image]);

  if (id) return { viewer: { id, name, image }, isPending: false, offline: false };
  if (isPending) return { viewer: null, isPending: true, offline: false };
  // A failed request isn't "signed out" (that's a 200 with no session).
  if (error) {
    const cached = readCachedViewer();
    if (cached) return { viewer: cached, isPending: false, offline: true };
  }
  return { viewer: null, isPending: false, offline: false };
}
