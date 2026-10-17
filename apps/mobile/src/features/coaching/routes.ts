import type { Href } from 'expo-router';
import { isShellV2 } from '../shell/shell-store';

// Where the coaching client surfaces send people: the routine and the training home live at different
// URLs in the two shells (old Gym tabs `/routine` and `/today`; the one-tab-bar shell's `/training/routine`
// and `/train`). The old URLs would still forward in the new shell, but a push through a forwarding
// layout leaves an extra screen on the stack — so link straight to the right one. Read at press time.

/** The client's routine: the old Gym Routine tab, or Train → Routine. */
export function routineHref(): Href {
  return isShellV2() ? '/training/routine' : '/routine';
}

/** The client's training home: the old Gym Today tab, or the Train tab. */
export function trainingHomeHref(): Href {
  return isShellV2() ? '/train' : '/today';
}
