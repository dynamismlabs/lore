/*
 * Lore's service worker: lets the app open with no signal, so you can still
 * record, write and take photos (they wait in the outbox, in IndexedDB, and
 * upload when you're back). It only caches the app itself: pages, scripts,
 * styles, fonts and icons. Memories, photos and the API are never cached here.
 *
 * Pages: network first (fresh when online), falling back to the last copy,
 * then to the home page. Build files (/_next/static, content-hashed): cache
 * first. Registered from src/lib/client/pwa.ts; `?mode=dev` (next dev) makes
 * everything network first so code edits show up.
 */
const VERSION = 'v5';
const PAGES = `lore-pages-${VERSION}`;
const ASSETS = `lore-assets-${VERSION}`;
const DEV = new URL(self.location.href).searchParams.get('mode') === 'dev';
const PAGE_TIMEOUT_MS = 4000;
const MAX_ASSETS = 400;
const PUBLIC_FILES =
  /^\/(icon[\w-]*\.(png|svg)|apple-touch-icon\.png|favicon(?:-dark)?\.(ico|png|svg)|site\.webmanifest)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Home is the fallback for any page we haven't kept a copy of.
      const pages = await caches.open(PAGES);
      await pages.add(new Request('/', { cache: 'reload' })).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, ASSETS]);
      for (const key of await caches.keys()) {
        if (!keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** The page tells us what it loaded before we were in control, so offline works on the next launch. */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      for (const raw of data.urls.slice(0, 300)) {
        let url;
        try {
          url = new URL(raw, self.location.origin);
        } catch {
          continue;
        }
        if (url.origin !== self.location.origin) continue;
        if (isAsset(url)) {
          const cache = await caches.open(ASSETS);
          if (!(await cache.match(url.href))) await cache.add(url.href).catch(() => {});
        } else if (isPage(url)) {
          const cache = await caches.open(PAGES);
          const key = pageKey(url);
          if (!(await cache.match(key))) {
            const response = await fetch(key, { credentials: 'same-origin' }).catch(() => null);
            if (response && response.ok && response.type === 'basic')
              await cache.put(key, response);
          }
        }
      }
      await trim(ASSETS, MAX_ASSETS);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch the API, auth, MCP or OAuth discovery.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/mcp' ||
    url.pathname.startsWith('/.well-known/')
  ) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(page(event, request, url));
  } else if (isAsset(url)) {
    event.respondWith(DEV || PUBLIC_FILES.test(url.pathname) ? fresh(request) : cached(request));
  }
});

function isAsset(url) {
  return url.pathname.startsWith('/_next/static/') || PUBLIC_FILES.test(url.pathname);
}

function isPage(url) {
  return (
    !url.pathname.startsWith('/_next/') &&
    !url.pathname.startsWith('/api/') &&
    !/\.\w+$/.test(url.pathname)
  );
}

/** One copy per path: /?source=app and / are the same page. */
function pageKey(url) {
  return url.origin + url.pathname;
}

async function page(event, request, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(url);
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(cache.put(key, copy).catch(() => {}));
    }
    return response;
  });
  network.catch(() => {}); // handled below; don't log it as unhandled
  // Don't wait forever on one bar of signal if we have a copy.
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const copy = await cache.match(key);
    if (copy) return copy;
    return await network;
  } catch {
    return (await cache.match(key)) || (await cache.match(url.origin + '/')) || offline();
  }
}

/** Content-hashed build files never change: cache first. */
async function cached(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone()).catch(() => {});
    trim(ASSETS, MAX_ASSETS);
  }
  return response;
}

/** Icons, the manifest and dev builds: network first, a copy for offline. */
async function fresh(request) {
  const cache = await caches.open(ASSETS);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic')
      await cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

/** Drop the oldest build files once there are too many (old deploys). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function offline() {
  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
      '<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;color:#555">' +
      '<p>You’re offline. Open Lore again when you have a connection.</p></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
