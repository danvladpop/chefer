import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface UseKeyboardInsetOptions {
  /**
   * Listen only while true (default). A mounted-but-hidden Sheet passes its
   * visibility so it neither subscribes nor re-renders on every keyboard event.
   */
  enabled?: boolean;
}

export interface KeyboardInset {
  /**
   * The bottom padding to apply to a container that must sit ABOVE the
   * keyboard, given that the container (or the screen under it) already
   * clears the bottom safe area itself — see `keyboardBottomInset`. Never
   * negative; 0 while the keyboard is hidden.
   */
  inset: number;
  /** The keyboard height exactly as RN reports it (see `keyboardBottomInset`), 0 while hidden. */
  keyboardHeight: number;
  /** True from the keyboard's show event until its hide event. */
  isVisible: boolean;
}

/**
 * The padding that lifts a container (which already clears the bottom safe
 * area on its own) to sit flush on the keyboard.
 *
 * The two platforms report the keyboard differently:
 *  - iOS: `endCoordinates.height` is the keyboard's full height from the
 *    bottom of the screen — it covers the home-indicator strip, which the
 *    container already pads for, so that strip is subtracted.
 *  - Android: RN's root view reports `ime.bottom - systemBars.bottom`
 *    (ReactRootView#checkForKeyboardEvents) — the navigation-bar strip is
 *    ALREADY taken out. Subtracting the safe-area bottom again lifted every
 *    container one navigation bar too little, so a Sheet's pinned footer
 *    ("Log") sat behind the keyboard: ~24 pt with gesture navigation on a
 *    phone, ~48 pt with 3-button navigation or a tablet's taskbar.
 */
export function keyboardBottomInset(
  os: typeof Platform.OS,
  keyboardHeight: number,
  safeAreaBottom: number,
): number {
  const overlap = os === 'android' ? keyboardHeight : keyboardHeight - safeAreaBottom;
  return Math.max(0, overlap);
}

/**
 * The one keyboard primitive for core RN (no native module, ships OTA):
 * `keyboardWillShow/Hide` on iOS (the layout moves together with the
 * keyboard), `keyboardDidShow/Hide` on Android (no Will* events exist there),
 * combined with the bottom safe-area inset per `keyboardBottomInset`.
 *
 * Why not `KeyboardAvoidingView`: under Expo SDK 57's mandatory Android
 * edge-to-edge the window no longer resizes for the keyboard, so
 * `behavior="height"` does nothing (UX-FOOD-07) and a Modal's content sits
 * outside the resize path anyway. Why not `automaticallyAdjustKeyboardInsets`
 * as well: stacking two mechanisms double-compensates on iOS (UX-X-02).
 * A container applies `inset` as its own bottom padding and nothing else:
 *
 * ```tsx
 * const { inset } = useKeyboardInset();
 * <View className="flex-1" style={{ paddingBottom: inset }}>...</View>
 * ```
 *
 * Plain state, no animation: iOS fires `keyboardWillShow` at the start of the
 * keyboard's own slide, so the layout change lands with it, and a spring on
 * top would only lag behind. (Nothing here moves with a transform, so there
 * is no reduced-motion variant to honour.)
 */
export function useKeyboardInset({ enabled = true }: UseKeyboardInsetOptions = {}): KeyboardInset {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setKeyboardHeight(0);
      setIsVisible(false);
      return undefined;
    }
    // Platform.OS is read at listen-time, not module load (testable, and
    // `keyboardWillShow` has no native event behind it on Android).
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(Math.max(0, e.endCoordinates.height));
      setIsVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setIsVisible(false);
    });
    // Mounted while the keyboard is already up (a sheet opened from a focused
    // field): there is no show event to wait for.
    const current = typeof Keyboard.metrics === 'function' ? Keyboard.metrics() : undefined;
    if (current && current.height > 0) {
      setKeyboardHeight(current.height);
      setIsVisible(true);
    }
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [enabled]);

  return {
    inset: isVisible ? keyboardBottomInset(Platform.OS, keyboardHeight, insets.bottom) : 0,
    keyboardHeight,
    isVisible,
  };
}
