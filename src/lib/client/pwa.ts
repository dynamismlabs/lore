/**
 * The installable app: registers the service worker (public/sw.js) and keeps
 * the browser's "install" offer so Settings and Home can show our own button.
 * iPhones never offer one; they get "Share → Add to Home Screen" instead.
 */
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// The offer can come before React mounts, so listen as soon as this loads.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const dev = process.env.NODE_ENV !== 'production';
  // `next dev` only with NEXT_PUBLIC_ENABLE_SW=1 (to test offline locally).
  if (dev && process.env.NEXT_PUBLIC_ENABLE_SW !== '1') return;
  navigator.serviceWorker
    .register(dev ? '/sw.js?mode=dev' : '/sw.js', { scope: '/' })
    .then(async () => {
      const ready = await navigator.serviceWorker.ready;
      // Keep what this page loaded before the worker was in charge, so the
      // very next launch works offline.
      const urls = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.startsWith(location.origin) && url.includes('/_next/static/'));
      ready.active?.postMessage({ type: 'cache', urls: [...urls, location.pathname, '/'] });
    })
    .catch((error) => console.warn('[sw] not registered', error));
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isPhoneOrTablet() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export interface InstallState {
  /** Already running from the home screen / as an app. */
  installed: boolean;
  /** The browser offered to install: `install()` shows its prompt. */
  canPrompt: boolean;
  /** iPhone/iPad in the browser: show "Share → Add to Home Screen". */
  ios: boolean;
}

const SERVER_STATE: InstallState = { installed: false, canPrompt: false, ios: false };
let snapshot: InstallState = SERVER_STATE;

function getSnapshot(): InstallState {
  const next = { installed: installedNow || isStandalone(), canPrompt: !!deferred, ios: isIos() };
  if (
    next.installed !== snapshot.installed ||
    next.canPrompt !== snapshot.canPrompt ||
    next.ios !== snapshot.ios
  ) {
    snapshot = next;
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

/** Show the browser's install prompt. Resolves true if they installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === 'accepted';
}
