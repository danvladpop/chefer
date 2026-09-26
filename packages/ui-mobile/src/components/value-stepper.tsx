import { memo, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';
import { STEPPER_REPEAT_DELAY_MS, STEPPER_REPEAT_INTERVAL_MS } from './stepper';

// A compact − value + stepper (promoted from the gym workout's set rows, G4-B).
// Differs from Stepper in two ways the workout needs:
//  • `next(value, direction)` decides the next value, so the weight stepper can
//    walk the equipment's ACHIEVABLE loads (engine stepUp/stepDown) instead of
//    a fixed step;
//  • no gaps and a flexible value cell, so two steppers + a 56pt ✓ fit a
//    360pt-wide phone. Buttons stay 44×44 (CLAUDE.md touch targets).
// Same testID scheme as Stepper: `${testID}-dec`, `-inc`, `-value`.

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

  const display = format(value);
  const button = (direction: 1 | -1) => (
    <PressableScale
      testID={`${testID}-${direction === 1 ? 'inc' : 'dec'}`}
      accessibilityRole="button"
      accessibilityLabel={`${direction === 1 ? 'Increase' : 'Decrease'} ${name.toLowerCase()}`}
      delayLongPress={STEPPER_REPEAT_DELAY_MS}
      onPress={() => nudge(direction)}
      onLongPress={() => startRepeat(direction)}
      onPressOut={stop}
      hitSlop={{ top: 4, bottom: 4 }}
      className="h-11 w-11 items-center justify-center rounded-md bg-muted active:opacity-70"
    >
      <Text className="text-xl font-semibold text-foreground">{direction === 1 ? '+' : '−'}</Text>
    </PressableScale>
  );

  return (
    <View
      testID={testID}
      accessibilityLabel={name}
      accessibilityValue={{ text: `${display} ${caption}` }}
      className={cn('min-w-0 flex-row items-center', className)}
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
          adjustsFontSizeToFit
          className={cn(
            'text-base font-semibold tabular-nums',
            done ? 'text-emerald-800' : 'text-foreground',
          )}
        >
          {display}
        </Text>
        <Text className="text-[12px] text-muted-foreground">{caption}</Text>
      </PressableScale>
      {button(1)}
    </View>
  );
}

export const ValueStepper = memo(ValueStepperImpl);
