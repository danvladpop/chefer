'use client';

import * as React from 'react';

// prefers-reduced-motion as a live React value (motion-system.md §6). Every
// piece of JS-driven motion (count-ups, the progress ring, overlay exits)
// reads this; CSS-only motion is covered by the global rule in globals.css.

const QUERY = '(prefers-reduced-motion: reduce)';

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => undefined;
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const getSnapshot = (): boolean => canMatch() && window.matchMedia(QUERY).matches;
// The server cannot know; hydration re-reads on the client.
const getServerSnapshot = (): boolean => false;

/** True while the OS/browser asks for reduced motion. Updates live. */
export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
