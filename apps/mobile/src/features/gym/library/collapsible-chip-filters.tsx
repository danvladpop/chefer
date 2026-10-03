import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { duration } from '@chefer/tokens';
import { useReducedMotion } from '@chefer/ui-mobile';

// UX-05 amendment A3 (T-05.A3.1, AC19-22): the Exercises tab and swap sheet
// each show their filter chips as separate horizontal rows normally, but
// collapse to a single strip while the keyboard is up (use-keyboard-visible)
// so >= 5 results stay visible above it. MO-05 (expand/collapse): rows fade
// in/out, instant under reduced motion.
//
// UX-GYM-08: the chip container deliberately has NO `layout={LinearTransition}`.
// On Android that layout animation drew the chip block ~100 px up, over the
// search box (it survived a cold relaunch, and a tap on the search selected
// "Chest"). The rows swap instantly; only their opacity animates.

export interface CollapsibleChipFiltersProps {
  /** True while the keyboard covers the screen — collapses every row into one strip. */
  collapsed: boolean;
  /** One entry per filter row's chip content (not pre-wrapped in a ScrollView). */
  rows: React.ReactNode[];
  testID?: string;
}

export function CollapsibleChipFilters({ collapsed, rows, testID }: CollapsibleChipFiltersProps) {
  const reducedMotion = useReducedMotion();
  const fadeMs = reducedMotion ? 0 : duration.fast;

  if (collapsed) {
    return (
      <View testID={testID}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="-mx-4"
          contentContainerClassName="flex-row items-center gap-2 px-4"
        >
          {rows.map((row, i) => (
            <Animated.View
              key={i}
              entering={FadeIn.duration(fadeMs)}
              className="flex-row items-center gap-2"
            >
              {row}
            </Animated.View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View testID={testID} className="gap-2">
      {rows.map((row, i) => (
        <Animated.View
          key={i}
          entering={FadeIn.duration(fadeMs)}
          exiting={FadeOut.duration(fadeMs)}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            className="-mx-4"
            contentContainerClassName="gap-2 px-4"
          >
            <View className="flex-row items-center gap-2">{row}</View>
          </ScrollView>
        </Animated.View>
      ))}
    </View>
  );
}
