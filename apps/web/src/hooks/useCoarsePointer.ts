'use client';

import { useEffect, useState } from 'react';

/**
 * True when the primary input is coarse — a finger rather than a mouse.
 *
 * Deliberately starts `false` and corrects after mount: the server has no way
 * to know the pointer type, so committing to an answer during render would
 * risk a hydration mismatch. Everything gated on this is interaction-time
 * behaviour, so a first paint with the desktop assumption is harmless.
 */
export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(hover: none), (pointer: coarse)');
    setIsCoarse(query.matches);

    const onChange = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isCoarse;
}
