import { useCallback, useContext, useEffect, useId } from 'react';
import {
  BottomTabBar,
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { setSnackbarTabBarHeight } from '@chefer/ui-mobile';

// App Review R-11: the single global <Snackbar /> (app/_layout.tsx) used to sit
// on top of the tab bar for 8 s and swallow tab taps. Both mode layouts render
// the stock bar through this wrapper, which forwards the bar's measured height
// (safe-area inset included) to the snackbar so it rides above it. The bar's
// own height callback still runs, so screen padding is unaffected.

/** Drop-in `tabBar` for `<Tabs>`: the stock bar, plus height publishing. */
export function SnackbarAwareTabBar(props: BottomTabBarProps) {
  const id = useId();
  const parent = useContext(BottomTabBarHeightCallbackContext);
  const onHeight = useCallback(
    (height: number) => {
      parent?.(height);
      setSnackbarTabBarHeight(id, height);
    },
    [parent, id],
  );
  useEffect(() => () => setSnackbarTabBarHeight(id, null), [id]);

  return (
    <BottomTabBarHeightCallbackContext.Provider value={onHeight}>
      <BottomTabBar {...props} />
    </BottomTabBarHeightCallbackContext.Provider>
  );
}
