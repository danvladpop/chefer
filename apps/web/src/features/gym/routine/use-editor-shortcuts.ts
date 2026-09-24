'use client';

import { useEffect } from 'react';

export interface UseEditorShortcutsOptions {
  /** Cmd/Ctrl+S. Escape is handled per-overlay by @chefer/ui's Sheet already. */
  onSave: () => void;
  enabled?: boolean;
}

/** Keyboard shortcuts on desktop (gym_plan.md §7 G5-B): Cmd/Ctrl+S saves. */
export function useEditorShortcuts({ onSave, enabled = true }: UseEditorShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      const isSaveCombo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (!isSaveCombo) return;
      event.preventDefault();
      onSave();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, enabled]);
}
