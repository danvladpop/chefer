import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useIsFocused, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

// Where this lives: `@chefer/ui-mobile` has no navigation dependency and the
// brief forbids adding one, so the hook sits next to the app's navigation
// (expo-router 57 vendors React Navigation 7; `usePreventRemove` is only
// reachable through `expo-router/react-navigation`).

export const UNSAVED_GUARD_DEFAULT_COPY = {
  title: 'Discard changes?',
  message: 'Your edits have not been saved.',
  discardLabel: 'Discard',
  keepLabel: 'Keep editing',
} as const;

export interface UnsavedGuardOptions {
  /**
   * Runs first when the user asks to go back (hardware BACK, and the header /
   * swipe back once prevented). Return `true` when you handled it by moving
   * inside the screen (step back a wizard page, close an inner panel): the
   * guard then shows no confirm and does not leave. Return anything else to
   * fall through to the confirm (when dirty) or to leaving (when not).
   *
   * Passing `onBack` also makes the guard intercept Android hardware BACK
   * while the screen is clean — `usePreventRemove` alone only fires while
   * dirty. A wizard whose step 2+ should never be left by a back gesture
   * passes `isDirty = step > 0 || hasEdits`.
   */
  onBack?: () => boolean | undefined;
  /** Confirm sheet copy. Defaults to {@link UNSAVED_GUARD_DEFAULT_COPY}. */
  title?: string;
  message?: string;
  discardLabel?: string;
  keepLabel?: string;
}

export interface UnsavedGuardSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: true;
  onConfirm: () => void;
}

export interface UnsavedGuard {
  /**
   * Spread into the shared sheet: `<ConfirmSheet testID="…" {...guard.sheetProps} />`.
   * (`ConfirmSheet` is the app's one "are you sure?" surface.)
   */
  sheetProps: UnsavedGuardSheetProps;
  /**
   * Call right BEFORE a deliberate exit that must not ask (after a successful
   * save → `guard.release(); router.back()`). Safe to call in the same tick
   * as the navigation: the blocked action is replayed as soon as React has
   * lifted the guard.
   */
  release: () => void;
}

/**
 * Blocks leaving a screen with unsaved work and confirms first.
 *
 * ```tsx
 * const guard = useUnsavedGuard(dirty, { title: 'Discard your changes?', message: '…' });
 * …
 * <ConfirmSheet testID="rf-discard" {...guard.sheetProps} />
 * // after a successful save:  guard.release(); router.back();
 * ```
 *
 * Built on React Navigation 7's `usePreventRemove(isDirty, …)`, which — unlike
 * a `beforeRemove` listener calling `preventDefault()` — also DISABLES the
 * native iOS interactive swipe-back while dirty, so the screen can no longer
 * be swiped away before the confirm (UX-X-01). The header back, Android
 * hardware BACK and any other pop go through the same path: removal is
 * prevented, the confirm opens, "Keep editing" closes it and leaves the
 * screen (and its edits) intact, "Discard" replays the blocked action.
 *
 * @param isDirty true while there is unsaved work; false lets every exit through.
 */
export function useUnsavedGuard(isDirty: boolean, options: UnsavedGuardOptions = {}): UnsavedGuard {
  const {
    onBack,
    title = UNSAVED_GUARD_DEFAULT_COPY.title,
    message = UNSAVED_GUARD_DEFAULT_COPY.message,
    discardLabel = UNSAVED_GUARD_DEFAULT_COPY.discardLabel,
    keepLabel = UNSAVED_GUARD_DEFAULT_COPY.keepLabel,
  } = options;
  const navigation = useNavigation();
  type NavigationAction = Parameters<typeof navigation.dispatch>[0];
  const focused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const [released, setReleased] = useState(false);

  // Latest values for the hardware-back subscription and the replay effect,
  // so neither re-subscribes on every keystroke.
  const onBackRef = useRef(onBack);
  const dirtyRef = useRef(isDirty);
  const releasedRef = useRef(false);
  // The action prevented while `released` was still false in the closure
  // that fired (release() + navigate in one tick), or the Discard target:
  // an action to replay, or 'back' for a hardware-BACK discard (no action).
  const pendingRef = useRef<NavigationAction | 'back' | null>(null);
  useEffect(() => {
    onBackRef.current = onBack;
    dirtyRef.current = isDirty;
  });

  usePreventRemove(isDirty && !released, ({ data }) => {
    if (onBackRef.current?.() === true) return;
    if (releasedRef.current) {
      // release() ran in this very tick: the guard is not lifted yet, so
      // queue the action; the effect below replays it once it is.
      pendingRef.current = data.action;
      return;
    }
    pendingRef.current = data.action;
    setVisible(true);
  });

  // Replay a queued action once the guard is lifted (released → true).
  useEffect(() => {
    if (!released || !pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === 'back') navigation.goBack();
    else navigation.dispatch(pending);
  }, [released, navigation]);

  // Android hardware BACK for in-screen steps: `usePreventRemove` only sees
  // removals, so a wizard (or an inner panel) needs its own hook first.
  const interceptsBack = onBack !== undefined;
  useEffect(() => {
    if (!interceptsBack || !focused) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (releasedRef.current) return false;
      if (onBackRef.current?.() === true) return true;
      if (dirtyRef.current) {
        pendingRef.current = 'back';
        setVisible(true);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [interceptsBack, focused]);

  const release = useCallback(() => {
    releasedRef.current = true;
    setReleased(true);
  }, []);

  const onClose = useCallback(() => {
    // "Keep editing" (also backdrop / ✕): stay put, forget the blocked action.
    setVisible(false);
    // After Discard the sheet's own exit calls this late — the replay owns
    // the pending action by then.
    if (!releasedRef.current) pendingRef.current = null;
  }, []);

  const onConfirm = useCallback(() => {
    // Discard: lift the guard, then the effect above replays the action.
    setVisible(false);
    releasedRef.current = true;
    setReleased(true);
    pendingRef.current ??= 'back';
  }, []);

  return {
    sheetProps: {
      visible,
      onClose,
      title,
      body: message,
      confirmLabel: discardLabel,
      cancelLabel: keepLabel,
      destructive: true,
      onConfirm,
    },
    release,
  };
}
