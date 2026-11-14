/**
 * What Lore's MCP view draws: the `structuredContent` of `show_memories` and
 * `open_lore`. Shared by the tools (server) and the view (browser), so keep it
 * to plain types.
 */

export interface ViewMemory {
  id: string;
  title: string | null;
  /** ISO time. The view formats it in the host's locale and time zone. */
  occurredAt: string;
  author: string;
  isMine: boolean;
  collections: string[];
  people: string[];
  /** The written text, or the voice note's transcript. */
  excerpt: string | null;
  /** Signed links that work for about an hour. Empty when links can't be signed. */
  photos: string[];
  photoCount: number;
  voice: { url: string | null; durationMs: number | null } | null;
  video: string | null;
  hearts: number;
  comments: number;
  /** The memory in Lore. */
  url: string;
}

export interface MemoriesView {
  view: 'memories';
  title: string;
  /** The search, when the list came from one. */
  query: string | null;
  memories: ViewMemory[];
  /** Ids the model asked for that the person can't see (or that don't exist). */
  missing: number;
  more: boolean;
  loreUrl: string;
}

export interface HomeView {
  view: 'home';
  /** Your vibes from about the last eight days. The view lays them out by day in the host's time zone. */
  vibes: { occurredAt: string; url: string | null }[];
  memories: ViewMemory[];
  loreUrl: string;
}

export type LoreView = MemoriesView | HomeView;
