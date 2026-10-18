import { useState, type ReactNode } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { duration, useReducedMotion } from '@chefer/ui-mobile';
import { consumeShellCrossfade } from './switch-mode';

// ─── MO-09: the mode switch's crossfade (trainer-mode.md §5.1) ───────────────
// The incoming shell (the (main) or (trainer) tab group) fades in, opacity
// only, when it mounts because of a mode switch; a cold start or a deep link
// shows it at once. Done here, not as the root Stack's `fade` animation: a
// native-stack fade between the two tab groups left the next tab blank now
// and then on iOS (Clients → Today rendered nothing until another tab press).

export function ShellCrossfade({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const [fade] = useState(() => consumeShellCrossfade() && !reducedMotion);
  return (
    <Animated.View style={{ flex: 1 }} entering={fade ? FadeIn.duration(duration.base) : undefined}>
      {children}
    </Animated.View>
  );
}
