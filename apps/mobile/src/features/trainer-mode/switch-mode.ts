import { AccessibilityInfo } from 'react-native';
import { router } from 'expo-router';
import { TRAINER_MODE_COPY, type AppShellMode } from '@chefer/types';
import { haptics } from '@chefer/ui-mobile';
import { track } from '../../lib/analytics';
import { askNotificationPermissionAt } from '../notifications/push/push-permission';
import { isShellV2 } from '../shell/shell-store';
import { setShellMode } from './mode-store';

// ─── Switching shells (trainer-mode.md §5.1) ──────────────────────────────────
// From the first row of either You tab. Lands on that mode's Today, with no
// reload: the incoming tab group fades in (MO-09, shell-crossfade.tsx). The
// light haptic plays, and screen readers hear the new mode's name. The first
// switch to trainer mode is push's `trainer_mode` moment (§7.2, M4): the OS
// permission is asked then, once per account.

export const TRAINER_TODAY_HREF = '/(trainer)/today';

/** Personal mode's Today: the revamp shell's `/home`, or the old Food Today at `/`. */
export function personalHomeHref(): '/home' | '/' {
  return isShellV2() ? '/home' : '/';
}

let crossfadeNext = false;

/** True once, for the shell that mounts right after a switch (ShellCrossfade). */
export function consumeShellCrossfade(): boolean {
  const fade = crossfadeNext;
  crossfadeNext = false;
  return fade;
}

export function switchShellMode(to: AppShellMode): void {
  haptics.tick();
  crossfadeNext = true;
  setShellMode(to);
  track('trainer_mode_switched', { to });
  AccessibilityInfo.announceForAccessibility(TRAINER_MODE_COPY.mode.switched(to));
  router.replace(to === 'trainer' ? TRAINER_TODAY_HREF : personalHomeHref());
  if (to === 'trainer') void askNotificationPermissionAt('trainer_mode');
}
