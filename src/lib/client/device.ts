/**
 * Small things this device remembers so Lore still opens with no signal: who
 * was signed in (name and picture, never a token), the collections you can
 * save to, and per-device preferences. Cleared on sign-out.
 */
export interface CachedViewer {
  id: string;
  name: string;
  image: string | null;
}

export interface CachedWritableCollection {
  id: string;
  name: string;
  isDefault: boolean;
  role?: string;
}

const VIEWER_KEY = 'lore:viewer';
const COLLECTIONS_KEY = 'lore:writable-collections';
const PREFERRED_COLLECTION_KEY = 'lore:preferred-collection';
const OPEN_TO_RECORD_KEY = 'lore:open-to-record';
const INSTALL_DISMISSED_KEY = 'lore:install-dismissed';

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / full storage: offline extras just won't be there.
  }
}

export const readCachedViewer = () => read<CachedViewer>(VIEWER_KEY);

export function writeCachedViewer(viewer: CachedViewer) {
  const current = readCachedViewer();
  if (current?.id === viewer.id && current.name === viewer.name && current.image === viewer.image) {
    return;
  }
  // A different account on this phone: the old one's offline list goes too.
  if (current && current.id !== viewer.id) {
    localStorage.removeItem(COLLECTIONS_KEY);
    localStorage.removeItem(PREFERRED_COLLECTION_KEY);
  }
  write(VIEWER_KEY, viewer);
}

/** The collections list for the "Save to" menu, for when it can't load. */
export function readCachedCollections<T>(viewerId: string | undefined): T | undefined {
  const cached = read<{ viewerId: string; collections: T }>(COLLECTIONS_KEY);
  return cached && cached.viewerId === viewerId ? cached.collections : undefined;
}

export function writeCachedCollections(viewerId: string, collections: unknown) {
  write(COLLECTIONS_KEY, { viewerId, collections });
}

/** The last shared collection the user chose to save into on this device. */
export function readPreferredCollectionId(viewerId: string | undefined): string | undefined {
  if (!viewerId) return undefined;
  const cached = read<{ viewerId: string; collectionId: string }>(PREFERRED_COLLECTION_KEY);
  return cached && cached.viewerId === viewerId ? cached.collectionId : undefined;
}

export function writePreferredCollectionId(viewerId: string, collectionId: string) {
  write(PREFERRED_COLLECTION_KEY, { viewerId, collectionId });
}

/**
 * Shared by default: once a user belongs to at least one shared collection
 * (like "Our family"), new captures default to their preferred/first shared
 * collection rather than private Moments. Falls back to Moments when they have
 * no shared collections yet.
 */
export function resolveDefaultCollectionId(
  viewerId: string | undefined,
  collections?: CachedWritableCollection[],
): string | undefined {
  const list = collections ?? readCachedCollections<CachedWritableCollection[]>(viewerId);
  if (!list?.length) return undefined;
  const shared = list.filter((c) => !c.isDefault);
  if (shared.length > 0) {
    const preferredId = readPreferredCollectionId(viewerId);
    const preferred = preferredId ? shared.find((c) => c.id === preferredId) : undefined;
    return (preferred ?? shared[0]).id;
  }
  return list[0].id;
}

export function clearDeviceCache() {
  try {
    localStorage.removeItem(VIEWER_KEY);
    localStorage.removeItem(COLLECTIONS_KEY);
    localStorage.removeItem(PREFERRED_COLLECTION_KEY);
  } catch {
    // nothing to clear
  }
}

/** Opening Lore from the home screen starts a recording. On unless you turn it off. */
export const readOpenToRecord = () => read<boolean>(OPEN_TO_RECORD_KEY) ?? true;
export const writeOpenToRecord = (on: boolean) => write(OPEN_TO_RECORD_KEY, on);

export const readInstallDismissed = () => read<boolean>(INSTALL_DISMISSED_KEY) ?? false;
export const writeInstallDismissed = () => write(INSTALL_DISMISSED_KEY, true);
