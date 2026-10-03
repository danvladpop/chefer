import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router, useSegments } from 'expo-router';
import type { LandingSurface } from '@chefer/utils';
import { landingSurfaceSync } from './use-landing';

// ─── Foreground re-landing (UX-PO-10, T-04.3) ───────────────────────────────────
// A phone left for half an hour has gone stale: the user who finished lunch and
// reopens the app should see what belongs to NOW (an in-progress workout, the
// training day), not the tab they happened to leave. After RELAND_AFTER_MS in
// the background, a foreground re-runs the same `landingFor` decision as a cold
// start — but only from a tab ROOT of the other surface. Anywhere deeper (a
// workout, a recipe, an onboarding step, a deep link or notification target) is
// an in-flight flow and is never yanked. Within the right surface it does
// nothing: it picks Food vs Gym, it does not shuffle tabs.

export const RELAND_AFTER_MS = 30 * 60 * 1000;

/** Whether the app was away long enough (`backgroundedAt` = when it left, null = never recorded). */
export function shouldReland(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= RELAND_AFTER_MS;
}

export type RelandHref = '/(food)' | '/today';

/**
 * Where to go, or null to stay. `segments` is the current route's segments:
 * a tab root is `(food)/…` or `(gym)/…`; every other first segment (`gym`,
 * `recipe`, `onboarding`, `cook`…) is a stack screen or a flow.
 */
export function relandTarget(
  segments: readonly string[],
  surface: LandingSurface,
): RelandHref | null {
  const group = segments[0];
  if (group === '(food)' && surface === 'gym') return '/today';
  if (group === '(gym)' && surface === 'food') return '/(food)';
  return null;
}

/**
 * Mount once (root layout, signed-in only). Records when the app leaves the
 * foreground; on return after RELAND_AFTER_MS, navigates per `relandTarget`.
 */
export function useForegroundRelanding(enabled: boolean): void {
  const segments = useSegments();
  const segmentsRef = useRef<readonly string[]>(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    if (!enabled) return;
    let backgroundedAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt ??= Date.now();
        return;
      }
      if (state !== 'active') return; // 'inactive' is a transient (call, control centre)
      const left = backgroundedAt;
      backgroundedAt = null;
      if (!shouldReland(left, Date.now())) return;
      const target = relandTarget(segmentsRef.current, landingSurfaceSync());
      if (target) router.replace(target);
    });
    return () => subscription.remove();
  }, [enabled]);
}
