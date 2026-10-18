import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type { AppShellMode } from '@chefer/types';
import { setShellMode } from './mode-store';

/**
 * Being in a shell means being in its mode (trainer-mode.md §5.1): each tab
 * group's layout calls this, so a deep link or a Back into either shell keeps
 * the remembered mode honest for the next cold start. In a layout the focus
 * is the root Stack's: it fires when the group comes to the top. `active`
 * false (the layout is only redirecting) writes nothing.
 */
export function useMarkShellMode(mode: AppShellMode, active: boolean): void {
  useFocusEffect(
    useCallback(() => {
      if (active) setShellMode(mode);
    }, [active, mode]),
  );
}
