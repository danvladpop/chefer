import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { springs } from '../motion/motion';
import { PressableScale } from '../motion/pressable-scale';
import { useReducedMotion } from '../motion/use-reduced-motion';
import { DENSE_MAX_FONT_SCALE } from './text';
import { colors } from './theme';

// Every segment keeps a 44pt hit area; `sm`/`xs` only shrink the visual.
const segmentTextVariants = cva('font-medium', {
  variants: {
    size: {
      default: 'text-sm',
      sm: 'text-xs',
      xs: 'text-xs',
    },
    selected: {
      true: 'text-foreground',
      false: 'text-muted-foreground',
    },
  },
  defaultVariants: { size: 'default', selected: false },
});

/** Inner padding of the track (p-1) — the sliding thumb is inset by it. */
export const TRACK_PADDING = 4;

/**
 * Where the thumb sits for a (possibly fractional, mid-spring) `position`
 * index. A pure worklet: it runs on the UI thread from SHARED values (track
 * width, option count, animated index), so it never depends on a JS-side
 * number captured when the style was created. UX-X-10: the old code captured
 * `maxX`/`segmentWidth` at mount (both 0 before the first layout) and, on
 * Android, the thumb kept drawing under option 0 while `value` was index 1.
 * The offset is clamped so the spring's ~6% overshoot never pokes out of the
 * track; before the first layout (`trackWidth` 0) the thumb has no width.
 */
export function thumbMetrics(
  trackWidth: number,
  count: number,
  position: number,
): { width: number; offset: number } {
  'worklet';
  if (trackWidth <= 0 || count <= 0) return { width: 0, offset: 0 };
  const width = (trackWidth - TRACK_PADDING * 2) / count;
  const maxOffset = (count - 1) * width;
  return { width, offset: Math.min(maxOffset, Math.max(0, position * width)) };
}

// The selected "thumb" is ONE absolutely-positioned view that slides between
// segments (Reanimated, spring `snappy` on the UI thread — MO-14; it jumps
// under reduced motion). Its shadow
// lives in `style`, never a toggled `shadow-*` class: NativeWind "upgrades" a
// component whose className gains a shadow at runtime, and that remount threw
// "Couldn't find a navigation context" on the Food/Gym switch (2026-09-25).
const THUMB_STYLE = {
  position: 'absolute',
  top: TRACK_PADDING,
  bottom: TRACK_PADDING,
  left: TRACK_PADDING,
  borderRadius: 6,
  backgroundColor: colors.card,
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  testID?: string;
}

export interface SegmentedControlProps<T extends string> {
  /** `xs` is the compact header size: 32pt visual, 44pt hit area. */
  size?: VariantProps<typeof segmentTextVariants>['size'];
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  testID?: string;
  /** Accessible name for the whole group, e.g. "App mode". */
  accessibilityLabel?: string;
}

/** iOS-style segmented control: one selected segment, equal widths, sliding thumb. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size,
  className,
  testID,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const reduced = useReducedMotion();
  // Shared values, read inside the worklet (UX-X-10): the measured track
  // width, the option count and the (animated) selected index. `position`
  // starts AT the selected index, so the first layout draws the thumb in
  // place instead of sliding in from option 0.
  const trackWidth = useSharedValue(0);
  const count = useSharedValue(options.length);
  const position = useSharedValue(index);
  const thumbStyle = useAnimatedStyle(() => {
    const { width, offset } = thumbMetrics(trackWidth.get(), count.get(), position.get());
    return { width, opacity: width > 0 ? 1 : 0, transform: [{ translateX: offset }] };
  });
  const placed = useRef(false);

  useEffect(() => {
    count.set(options.length);
    if (!placed.current || reduced) {
      // First render / reduced motion: jump into place.
      position.set(index);
      placed.current = true;
      return;
    }
    position.set(withSpring(index, springs.snappy));
  }, [index, options.length, reduced, count, position]);

  const compact = size === 'xs';

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => trackWidth.set(e.nativeEvent.layout.width)}
      className={cn('flex-row rounded-lg bg-muted p-1', className)}
    >
      <Animated.View pointerEvents="none" style={[THUMB_STYLE, thumbStyle]} />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            testID={option.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            // Compact keeps the 44pt target via hitSlop (32pt visual + 2×6).
            hitSlop={compact ? { top: 6, bottom: 6 } : undefined}
            onPress={() => {
              if (!selected) {
                haptics.selection();
                onChange(option.value);
              }
            }}
            // Large OS text: labels wrap to two lines, then shrink up to 20%
            // rather than break mid-word (X-08); the compact size stays on one.
            className={cn(
              'flex-1 items-center justify-center rounded-md px-3',
              compact ? 'min-h-8' : 'min-h-11 py-1',
            )}
          >
            <Text
              className={cn(segmentTextVariants({ size, selected }), 'text-center')}
              maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
              numberOfLines={compact ? 1 : 2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
