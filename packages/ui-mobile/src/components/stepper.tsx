import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Display formatter for the value (defaults to the plain number). */
  format?: (value: number) => string;
  /** Optional unit/caption under the value, e.g. "kg" or "reps". */
  label?: string;
  /** Tapping the value (e.g. to open a keypad or plate calculator). */
  onPressValue?: () => void;
  disabled?: boolean;
  className?: string;
  /** Children get `${testID}-dec`, `${testID}-inc` and `${testID}-value`. */
  testID?: string;
  /** Accessible name, e.g. "Weight". */
  accessibilityLabel?: string;
}

/** Delay before a held button starts repeating, then the repeat interval. */
export const STEPPER_REPEAT_DELAY_MS = 400;
export const STEPPER_REPEAT_INTERVAL_MS = 90;

// Round away float noise from fractional steps (2.5 kg, 1.25 lb…).
const tidy = (n: number) => Math.round(n * 1000) / 1000;

/**
 * − value + stepper. Both buttons are 44pt; holding one repeats until release
 * (the active-workout screen's "no keyboard for common edits" rule). The
 * buttons scale on press (MO-01) and every change ticks a selection haptic.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  format,
  label,
  onPressValue,
  disabled = false,
  className,
  testID,
  accessibilityLabel,
}: StepperProps) {
  // The repeat timer outlives renders — read the freshest value/props via refs.
  const latest = useRef({ value, onChange, min, max, step });
  latest.current = { value, onChange, min, max, step };
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => stop, []);

  const nudge = (direction: 1 | -1): boolean => {
    const { value: current, onChange: emit, min: lo, max: hi, step: size } = latest.current;
    const next = tidy(Math.min(hi, Math.max(lo, current + direction * size)));
    if (next === current) {
      return false;
    }
    latest.current.value = next;
    haptics.selection();
    emit(next);
    return true;
  };

  const startRepeat = (direction: 1 | -1) => {
    stop();
    if (!nudge(direction)) {
      return;
    }
    timer.current = setInterval(() => {
      if (!nudge(direction)) {
        stop();
      }
    }, STEPPER_REPEAT_INTERVAL_MS);
  };

  const atMin = value <= min;
  const atMax = value >= max;
  const display = format ? format(value) : String(value);

  const button = (direction: 1 | -1, blocked: boolean) => (
    <PressableScale
      testID={testID ? `${testID}-${direction === 1 ? 'inc' : 'dec'}` : undefined}
      accessibilityRole="button"
      accessibilityLabel={`${direction === 1 ? 'Increase' : 'Decrease'}${
        accessibilityLabel ? ` ${accessibilityLabel.toLowerCase()}` : ''
      }`}
      accessibilityState={{ disabled: disabled || blocked }}
      disabled={disabled || blocked}
      delayLongPress={STEPPER_REPEAT_DELAY_MS}
      onPress={() => nudge(direction)}
      onLongPress={() => startRepeat(direction)}
      onPressOut={stop}
      className="h-11 w-11 items-center justify-center rounded-md bg-muted active:opacity-70 disabled:opacity-40"
    >
      <Text className="text-xl font-semibold text-foreground">{direction === 1 ? '+' : '−'}</Text>
    </PressableScale>
  );

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: display }}
      className={cn('flex-row items-center gap-1', className)}
    >
      {button(-1, atMin)}
      <PressableScale
        testID={testID ? `${testID}-value` : undefined}
        accessibilityRole={onPressValue ? 'button' : 'text'}
        disabled={!onPressValue || disabled}
        onPress={onPressValue}
        className="min-h-11 min-w-12 items-center justify-center px-1"
      >
        <Text className="text-base font-semibold tabular-nums text-foreground">{display}</Text>
        {label ? <Text className="text-[12px] text-muted-foreground">{label}</Text> : null}
      </PressableScale>
      {button(1, atMax)}
    </View>
  );
}
