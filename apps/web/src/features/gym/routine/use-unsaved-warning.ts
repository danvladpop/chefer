'use client';

import { useEffect } from 'react';

/**
 * Warns on leaving with unsaved changes (gym_plan.md §7 G5-B): a native
 * confirmation on tab close/refresh/external navigation while the draft is
 * dirty. `@chefer/ui`'s Sheet handles Escape/backdrop dismissal for overlays;
 * this only covers navigating away from the page itself.
 */
export function useUnsavedChangesWarning(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      // preventDefault() is the modern, spec-compliant way to trigger the
      // browser's native "leave site?" prompt — `returnValue` is legacy and
      // deprecated (older Chrome needed it, current browsers ignore its text).
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

/** In-app confirmation for a Back/navigate action the page itself triggers. */
export function confirmDiscardChanges(isDirty: boolean): boolean {
  if (!isDirty) return true;
  return window.confirm('You have unsaved changes to this routine. Leave without saving?');
}
