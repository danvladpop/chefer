import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { TRAINER_MODE_COPY, type AppShellMode } from '@chefer/types';
import { haptics } from '@chefer/ui-mobile';
import { track } from '../../lib/analytics';
import { isShellV2 } from '../shell/shell-store';
import { setShellMode } from './mode-store';

// ─── Switching shells (trainer-mode.md §5.1) ──────────────────────────────────
// From the first row of either You tab. Lands on that mode's Today, with no
// reload: the root Stack cross-fades between the (main) and (trainer) groups
// (MO-09, app/_layout.tsx). The light haptic plays, and screen readers hear
// the new mode's name.

export const TRAINER_TODAY_HREF = '/(trainer)/today';

/** Personal mode's Today: the revamp shell's `/home`, or the old Food Today at `/`. */
export function personalHomeHref(): '/home' | '/' {
  return isShellV2() ? '/home' : '/';
}

export function switchShellMode(to: AppShellMode): void {
  haptics.tick();
  setShellMode(to);
  track('trainer_mode_switched', { to });
  AccessibilityInfo.announceForAccessibility(TRAINER_MODE_COPY.mode.switched(to));
  router.replace(to === 'trainer' ? TRAINER_TODAY_HREF : personalHomeHref());
}
