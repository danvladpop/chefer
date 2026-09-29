import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';

/**
 * Orchestrator review fix (Maestro, iOS simulator): a kit `Sheet`'s own
 * `maxHeight` is a fraction of the FULL window and never accounts for the
 * on-screen keyboard. Content in a `scrollable={false}` Sheet body has no
 * forced-shrink chain down to its children (RN Views default to
 * `flexShrink: 0`, and the body's own shrinking doesn't clip an
 * unconstrained child — see ingredient-search-sheet.tsx's other bug-fix
 * note), so a results list that just sizes to itself can render past the
 * visible area and UNDER a pinned footer once the keyboard is up.
 *
 * This computes a real "window minus keyboard minus the sheet's own
 * chrome" bound, so content wrapped in it scrolls behind a clipped edge
 * instead. `reservedPx` is a deliberately generous estimate of everything
 * ELSE in the sheet (grabber + title row, fields above the bounded region,
 * the footer, safe-area padding) — better to show one row fewer than to
 * risk the overlap again.
 */
export function useKeyboardAwareMaxHeight(reservedPx: number, minPx = 120): number {
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return Math.max(minPx, windowHeight - keyboardHeight - reservedPx);
}
