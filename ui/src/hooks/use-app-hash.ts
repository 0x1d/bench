import { useSyncExternalStore } from 'react';

function getHash(): string {
  if (typeof window === 'undefined') return '';
  return window.location.hash.slice(1) || 'status';
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener('hashchange', onStoreChange);
  return () => window.removeEventListener('hashchange', onStoreChange);
}

/** Current `window.location.hash` segment (after `#`), for layout tied to route. */
export function useAppHash(): string {
  return useSyncExternalStore(subscribe, getHash, getHash);
}
