import { memo, useEffect, useRef } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';
import { STEPPER_REPEAT_DELAY_MS, STEPPER_REPEAT_INTERVAL_MS } from './stepper';
import { DENSE_MAX_FONT_SCALE } from './text';

// A compact − value + stepper (promoted from the gym workout's set rows, G4-B).
// Differs from Stepper in two ways the workout needs:
//  • `next(value, direction)` decides the next value, so the weight stepper can
//    walk the equipment's ACHIEVABLE loads (engine stepUp/stepDown) instead of
//    a fixed step;
//  • no gaps and a flexible value cell, so two steppers + a 56pt ✓ fit a
//    360pt-wide phone. Buttons stay 44×44 (CLAUDE.md touch targets).
// Same testID scheme as Stepper: `${testID}-dec`, `-inc`, `-value`.

// T-BUG-O2 (O-07): `adjustsFontSizeToFit` measures the shrink factor against
// the cell's width at that render's measure time and, on the new
// architecture, never recomputes it upward once the cell widens again — a
// transient narrow measure of one row (a re-layout triggered by a sibling
// changing) leaves that row's value stuck at a near-zero scale forever, even
// though identical neighbouring rows render normally. The fix removes the
// auto-shrink mechanism entirely: the font size is a pure function of the
// string, sized to fit a 375pt-wide row (the narrowest
// layout this stepper currently ships in) for the longest values it renders
// today, e.g. "102.5" (kg with a decimal) and "1:30" (a mm:ss rest/tempo
// value).
//
// WP-04 raised the sizes one step (17/15/13 -> 20/17/14, the logger's
// `text-xl` value) along with the type scale. The numeric value itself is
// capped at `VALUE_MAX_FONT_SCALE` (1.3, not the dense 1.6): it already starts
// at 20pt and sits in a width-constrained cell with no auto-shrink, so a 1.6×
// OS size would truncate "102.5" — the −/+ glyphs and the caption keep the
// full dense cap.
export const VALUE_MAX_FONT_SCALE = 1.3;
export function valueFontSize(display: string): number {
  if (display.length <= 4) return 20;
  if (display.length === 5) return 17;
  return 14;
}

export interface ValueStepperProps {
  value: number;
  next: (value: number, direction: 1 | -1) => number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  /** Caption under the value ("kg", "reps"). */
  caption: string;
  /** Accessible name, e.g. "Weight". */
  name: string;
  onPressValue?: () => void;
  done?: boolean;
  testID: string;
  className?: string;
  /**
   * `plain` (default): the original no-gap tiles other callers still use.
   * `grouped` (UX-05 A1, O-05/O-06): one filled 48 pt container with
   * transparent −/+ buttons, so the eye reads one control, not three tiles.
   * Callers space `grouped` instances 8 pt apart themselves (`set-row.tsx`).
   */
  variant?: 'plain' | 'grouped';
}

function ValueStepperImpl({
  value,
  next,
  onChange,
  format,
  caption,
  name,
  onPressValue,
  done = false,
  testID,
  className,
  variant = 'plain',
}: ValueStepperProps) {
  // The repeat timer outlives renders — read fresh props through a ref.
  const latest = useRef({ value, next, onChange });
  useEffect(() => {
    latest.current = { value, next, onChange };
  }, [value, next, onChange]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => stop, []);

  const nudge = (direction: 1 | -1): boolean => {
    const { value: current, next: step, onChange: emit } = latest.current;
    const target = step(current, direction);
    if (target === current) return false;
    latest.current = { ...latest.current, value: target };
    haptics.selection();
    emit(target);
    return true;
  };

  const startRepeat = (direction: 1 | -1) => {
    stop();
    if (!nudge(direction)) return;
    timer.current = setInterval(() => {
      if (!nudge(direction)) stop();
    }, STEPPER_REPEAT_INTERVAL_MS);
  };

  const grouped = variant === 'grouped';
  const display = format(value);
  const tight = useWindowDimensions().fontScale > 1.2;
  const button = (direction: 1 | -1) => (
    <PressableScale
      testID={`${testID}-${direction === 1 ? 'inc' : 'dec'}`}
      accessibilityRole="button"
      accessibilityLabel={`${direction === 1 ? 'Increase' : 'Decrease'} ${name.toLowerCase()}`}
      delayLongPress={STEPPER_REPEAT_DELAY_MS}
      onPress={() => nudge(direction)}
      onLongPress={() => startRepeat(direction)}
      onPressOut={stop}
      // Large OS text: the value cell grows, so the −/+ visual narrows to 36 pt
      // and hitSlop keeps the 44 pt target (WP-04 device pass: the set row's
      // tick was pushed off the card at accessibility-XL).
      hitSlop={tight ? { top: 4, bottom: 4, left: 4, right: 4 } : { top: 4, bottom: 4 }}
      className={cn(
        tight ? 'h-11 w-9 items-center justify-center' : 'h-11 w-11 items-center justify-center',
        // Grouped: transparent, sits inside the shared container; pressed
        // state is 5% darker (MO-01) instead of its own fill (UX-05 A1).
        grouped ? 'active:bg-black/5' : 'rounded-md bg-muted active:opacity-70',
      )}
    >
      <Text
        maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
        className="text-xl font-semibold text-foreground"
      >
        {direction === 1 ? '+' : '−'}
      </Text>
    </PressableScale>
  );

  return (
    <View
      testID={testID}
      accessibilityLabel={name}
      accessibilityValue={{ text: `${display} ${caption}` }}
      className={cn(
        'min-w-0 flex-row items-center',
        grouped && 'h-12 rounded-lg bg-muted',
        className,
      )}
    >
      {button(-1)}
      <PressableScale
        testID={`${testID}-value`}
        accessibilityRole={onPressValue ? 'button' : 'text'}
        accessibilityLabel={`${name} ${display} ${caption}${onPressValue ? ', tap to type' : ''}`}
        disabled={!onPressValue}
        onPress={onPressValue}
        className="min-h-11 min-w-9 flex-1 items-center justify-center"
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={VALUE_MAX_FONT_SCALE}
          style={{ fontSize: valueFontSize(display) }}
          className={cn(
            'font-semibold tabular-nums',
            done ? 'text-emerald-800' : 'text-foreground',
          )}
        >
          {display}
        </Text>
        <Text
          maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}
          className="text-xs text-muted-foreground"
        >
          {caption}
        </Text>
      </PressableScale>
      {button(1)}
    </View>
  );
}

export const ValueStepper = memo(ValueStepperImpl);
