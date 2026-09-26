import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { springs } from '../motion/motion';
import { PressableScale } from '../motion/pressable-scale';
import { useReducedMotion } from '../motion/use-reduced-motion';
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
const TRACK_PADDING = 4;

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
  const [trackWidth, setTrackWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segmentWidth =
    trackWidth > 0 ? (trackWidth - TRACK_PADDING * 2) / Math.max(options.length, 1) : 0;
  const reduced = useReducedMotion();
  const translateX = useSharedValue(0);
  // The spring overshoots ~6%: clamp so the thumb never pokes out of the track.
  const maxX = Math.max(0, (options.length - 1) * segmentWidth);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.min(maxX, Math.max(0, translateX.get())) }],
  }));
  const placed = useRef(false);

  useEffect(() => {
    if (segmentWidth <= 0) return;
    const target = index * segmentWidth;
    if (!placed.current || reduced) {
      // First layout: jump into place, don't animate from the left edge.
      translateX.set(target);
      placed.current = true;
      return;
    }
    translateX.set(withSpring(target, springs.snappy));
  }, [index, segmentWidth, translateX, reduced]);

  const compact = size === 'xs';

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      className={cn('flex-row rounded-lg bg-muted p-1', className)}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[THUMB_STYLE, { width: segmentWidth }, thumbStyle]}
        />
      ) : null}
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
            className={cn(
              'flex-1 items-center justify-center rounded-md px-3',
              compact ? 'h-8' : 'min-h-11',
            )}
          >
            <Text className={segmentTextVariants({ size, selected })}>{option.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
