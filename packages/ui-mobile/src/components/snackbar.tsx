import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation } from '@chefer/tokens';
import { haptics } from '../motion/haptics';
import { duration, springs, timing } from '../motion/motion';
import { useReducedMotion } from '../motion/use-reduced-motion';
import { Text } from './text';

// PAT-4 — Snackbar with Undo (technical-plan.md §2.4). A tiny module-level
// store (no extra dependency: same `useSyncExternalStore` shape as the app's
// rebalance-store.ts) holds at most one message; `useSnackbar().show(...)`
// from anywhere replaces whatever is showing, and `<Snackbar />` (mounted
// once, above the tab bar — see apps/mobile/app/_layout.tsx) renders it. JS
// only (Reanimated), so this ships OTA.

const DEFAULT_DURATION_MS = 6000;
// UX-X-16: ~10 s with an Undo — long enough to read the message and reach for it.
const WITH_ACTION_DURATION_MS = 10000;
/** After a touch is released, the bar stays at least this long so the tap can land (UX-X-16). */
export const SNACKBAR_MIN_RESUME_MS = 2000;
/**
 * UX-X-16: for this long after the bar has gone, an invisible shield keeps
 * its footprint, so a tap meant for Undo as it fades does not fall through to
 * the control underneath (opening a picker, ticking another row).
 */
export const SNACKBAR_TAP_SHIELD_MS = 300;

export interface SnackbarOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Defaults to 6 s (10 s with an action); doubled while a screen reader runs; paused while the bar is touched. */
  durationMs?: number;
  /** Fires `haptics.success` on show. Omit for a purely informational bar —
   * "success for confirmations, none for info" (§2.4). */
  tone?: 'success' | 'info';
}

interface SnackbarState {
  id: number;
  message: string;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  durationMs: number;
}

let state: SnackbarState | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SnackbarState | null {
  return state;
}

// R-11: the tab bar's height (inset included), published by the tab layouts so
// the snackbar sits ABOVE it instead of covering it. Last-registered bar wins:
// switching Food <-> Gym mounts one tab layout before the other unmounts.
const tabBars = new Map<string, number>();
const tabBarListeners = new Set<() => void>();
let tabBarHeight = 0;

function recomputeTabBarHeight(): void {
  const heights = [...tabBars.values()];
  const next = heights.length ? (heights[heights.length - 1] ?? 0) : 0;
  if (next === tabBarHeight) return;
  tabBarHeight = next;
  tabBarListeners.forEach((listener) => listener());
}

/**
 * Register (or update) a tab bar's full height, measured from the bottom of
 * the screen, safe-area inset included. Pass `null` when it unmounts. Returns
 * nothing; `id` identifies the bar (one per tab layout).
 */
export function setSnackbarTabBarHeight(id: string, height: number | null): void {
  tabBars.delete(id);
  if (height !== null && height > 0) tabBars.set(id, height);
  recomputeTabBarHeight();
}

function subscribeTabBar(listener: () => void): () => void {
  tabBarListeners.add(listener);
  return () => tabBarListeners.delete(listener);
}

function getTabBarHeight(): number {
  return tabBarHeight;
}

function announce(message: string, actionLabel?: string): void {
  try {
    AccessibilityInfo.announceForAccessibility(
      actionLabel ? `${message}, ${actionLabel}` : message,
    );
  } catch {
    // No accessibility service (tests, some Android builds) — nothing to do.
  }
}

function showSnackbar(options: SnackbarOptions): void {
  const durationMs =
    options.durationMs ?? (options.actionLabel ? WITH_ACTION_DURATION_MS : DEFAULT_DURATION_MS);
  state = {
    id: ++nextId,
    message: options.message,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
    durationMs,
  };
  notify();
  if (options.tone === 'success') {
    haptics.success();
  }
  announce(options.message, options.actionLabel);
}

function dismissSnackbar(id: number): void {
  if (state?.id === id) {
    state = null;
    notify();
  }
}

/** Test-only: clears the module-level store between tests (same convention
 * as `resetRebalanceStoreForTests`). Never call this from app code. */
export function resetSnackbarForTests(): void {
  state = null;
  tabBars.clear();
  recomputeTabBarHeight();
  notify();
}

/** `useSnackbar().show({ message, actionLabel?, onAction?, durationMs?, tone? })`. */
export function useSnackbar(): { show: (options: SnackbarOptions) => void } {
  return { show: showSnackbar };
}

export interface SnackbarProps {
  /** Extra bottom offset above the safe-area inset — e.g. the tab bar's
   * height, so the bar sits above it rather than under it. */
  bottomOffset?: number;
}

/**
 * The snackbar host — mount exactly once, near the root. On tab screens it
 * rides above the tab bar (the layouts publish its height through
 * `setSnackbarTabBarHeight`, R-11) and its wrapper is `box-none`, so taps
 * anywhere but on the toast itself reach the tab bar and the screen below.
 * Renders nothing while the store is empty.
 */
export function Snackbar({ bottomOffset = 0 }: SnackbarProps = {}) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const publishedTabBar = useSyncExternalStore(subscribeTabBar, getTabBarHeight, getTabBarHeight);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // Kept only for the ~150 ms fade-out after `current` goes back to null —
  // `current` itself already reflects a new message the instant the store
  // notifies, so showing it never waits on this state.
  const [lastShown, setLastShown] = useState<SnackbarState | null>(null);
  // UX-X-16: true for SNACKBAR_TAP_SHIELD_MS after the bar has gone.
  const [shield, setShield] = useState(false);
  const opacity = useSharedValue(0);
  const rise = useSharedValue(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // UX-X-16 pause-on-touch bookkeeping: when the current countdown started,
  // how much of it is left, whether a finger is down, and which bar it is for.
  const countdownStart = useRef(0);
  const remainingMs = useRef(0);
  const touched = useRef(false);
  const currentId = useRef<number | null>(null);

  const startCountdown = (total: number) => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
    remainingMs.current = total;
    countdownStart.current = Date.now();
    const id = currentId.current;
    // A finger already down holds the countdown until it is released.
    if (touched.current || id === null) return;
    dismissTimer.current = setTimeout(() => dismissSnackbar(id), total);
  };

  /** Finger down on the bar: freeze the countdown with what is left of it. */
  const pauseCountdown = () => {
    touched.current = true;
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
      remainingMs.current = Math.max(
        0,
        remainingMs.current - (Date.now() - countdownStart.current),
      );
    }
  };

  /** Finger up: carry on with the rest (at least SNACKBAR_MIN_RESUME_MS). */
  const resumeCountdown = () => {
    if (!touched.current) return;
    touched.current = false;
    if (currentId.current === null) return;
    startCountdown(Math.max(remainingMs.current, SNACKBAR_MIN_RESUME_MS));
  };

  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (shieldTimer.current) {
      clearTimeout(shieldTimer.current);
      shieldTimer.current = null;
    }
    currentId.current = current?.id ?? null;
    touched.current = false;

    if (!current) {
      if (lastShown) {
        opacity.set(withTiming(0, timing(duration.fast)));
        hideTimer.current = setTimeout(() => {
          setLastShown(null);
          setShield(true);
          shieldTimer.current = setTimeout(() => setShield(false), SNACKBAR_TAP_SHIELD_MS);
        }, duration.fast);
      }
      return;
    }
    setShield(false);

    setLastShown(current);
    if (reduced) {
      opacity.set(withTiming(1, timing(duration.fast)));
      rise.set(1);
    } else {
      opacity.set(withTiming(1, timing(duration.base)));
      rise.set(withSpring(1, springs.gentle));
    }

    let cancelled = false;
    const scheduleDismiss = (total: number) => {
      if (cancelled) return;
      startCountdown(total);
    };
    // Pauses under a screen reader: the bar stays up twice as long so a
    // VoiceOver/TalkBack user has time to swipe to the action (§2.4).
    AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => scheduleDismiss(enabled ? current.durationMs * 2 : current.durationMs))
      .catch(() => scheduleDismiss(current.durationMs));

    return () => {
      cancelled = true;
    };
    // opacity/rise are stable Reanimated shared values, not reactive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (shieldTimer.current) clearTimeout(shieldTimer.current);
    },
    [],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: reduced ? 0 : (1 - rise.get()) * 12 }],
  }));

  const displayed = current ?? lastShown;
  const bottom =
    (publishedTabBar > 0 ? publishedTabBar + bottomOffset : insets.bottom + bottomOffset) + 8;
  if (!displayed) {
    if (!shield) return null;
    // UX-X-16: same footprint as the bar, invisible, swallowing stray taps.
    return (
      <Animated.View
        pointerEvents="box-none"
        className="absolute inset-x-0 items-center px-4"
        style={{ bottom }}
      >
        <View testID="snackbar-shield" className="min-h-11 w-full max-w-[560px]" />
      </Animated.View>
    );
  }

  const handleAction = () => {
    displayed.onAction?.();
    dismissSnackbar(displayed.id);
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center px-4"
      // A published tab bar height already includes the safe-area inset.
      style={{ bottom }}
    >
      <Animated.View
        testID="snackbar"
        accessibilityLiveRegion={Platform.OS === 'android' ? 'polite' : undefined}
        className="min-h-11 w-full max-w-[560px] flex-row items-center rounded-full bg-foreground px-4 py-2.5"
        style={[animatedStyle, { boxShadow: elevation.e3 }]}
        // UX-X-16: a finger on the bar holds the countdown (touches on the
        // Undo button bubble up to here).
        onTouchStart={pauseCountdown}
        onTouchEnd={resumeCountdown}
        onTouchCancel={resumeCountdown}
      >
        <Text testID="snackbar-message" className="min-w-0 flex-1 text-[15px] text-background">
          {displayed.message}
        </Text>
        {displayed.actionLabel ? (
          <Pressable
            testID="snackbar-action"
            accessibilityRole="button"
            onPress={handleAction}
            hitSlop={8}
            className="min-h-11 min-w-11 items-center justify-center pl-3"
          >
            <Text className="text-[15px] font-semibold text-primary-foreground">
              {displayed.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
