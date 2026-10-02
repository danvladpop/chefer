import { Text, View } from 'react-native';
import { cva } from 'class-variance-authority';
import { cn } from '@chefer/utils';
import { haptics } from '../motion/haptics';
import { PressableScale } from '../motion/pressable-scale';
import { DENSE_MAX_FONT_SCALE, Text as HintText } from './text';

// `min-h-11` (never `h-11`) + `py-2` + `max-w-full`: at large OS text sizes a
// long label wraps onto a second line and the pill grows with it instead of
// truncating (X-08); the 44pt hit area holds at every size.
export const chipVariants = cva(
  'min-h-11 max-w-full flex-row items-center justify-center rounded-full border px-4 py-2',
  {
    variants: {
      selected: {
        true: 'border-primary bg-primary',
        false: 'border-border bg-background',
      },
    },
    defaultVariants: { selected: false },
  },
);

export const chipTextVariants = cva('shrink text-center text-sm font-medium', {
  variants: {
    selected: {
      true: 'text-primary-foreground',
      false: 'text-foreground',
    },
  },
  defaultVariants: { selected: false },
});

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: (() => void) | undefined;
  disabled?: boolean;
  /** Read after the label by a screen reader, e.g. why a disabled chip is
   * disabled ("Part of Premium"). Purely auditory — pair it with a visible
   * caption (ChipGroup's `hints`) for sighted users. */
  accessibilityHint?: string | undefined;
  className?: string;
  testID?: string | undefined;
}

/**
 * Pill toggle — filters, RIR answers, weekday pickers. 44pt tall. Scales on
 * press (MO-01) and ticks a selection haptic when tapped.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  accessibilityHint,
  className,
  testID,
}: ChipProps) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={
        onPress
          ? () => {
              haptics.selection();
              onPress();
            }
          : undefined
      }
      className={cn(chipVariants({ selected }), disabled && 'opacity-50', className)}
    >
      <Text className={chipTextVariants({ selected })} maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE}>
        {label}
      </Text>
    </PressableScale>
  );
}

export interface ChipOption<T extends string | number> {
  value: T;
  label: string;
  testID?: string | undefined;
}

export interface ChipGroupProps<T extends string | number> {
  options: readonly ChipOption<T>[];
  /** Selected values (one element at most unless `multiple`). */
  value: readonly T[];
  onChange: (value: T[]) => void;
  /** Allow several selected chips (filters). Default: single choice. */
  multiple?: boolean;
  /** Single choice only: tapping the selected chip clears it. */
  allowEmpty?: boolean;
  /** Values rendered disabled — never selectable (e.g. gated behind
   * Premium; pair with a `hints` entry and the PAT-3 taste link). */
  disabledValues?: readonly T[];
  /** Short caption under a chip (visible + read as its accessibility hint),
   * keyed by value — typically why a disabled option is disabled. */
  hints?: Partial<Record<T, string>>;
  className?: string;
  testID?: string;
}

/** A wrapping row of chips with single- or multi-select semantics. */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  multiple = false,
  allowEmpty = false,
  disabledValues,
  hints,
  className,
  testID,
}: ChipGroupProps<T>) {
  const toggle = (option: T) => {
    const isSelected = value.includes(option);
    if (multiple) {
      onChange(isSelected ? value.filter((v) => v !== option) : [...value, option]);
      return;
    }
    if (isSelected) {
      if (allowEmpty) {
        onChange([]);
      }
      return;
    }
    onChange([option]);
  };

  return (
    <View testID={testID} className={cn('flex-row flex-wrap gap-2', className)}>
      {options.map((option) => {
        const disabled = disabledValues?.includes(option.value) ?? false;
        const hint = hints?.[option.value];
        return (
          <View key={String(option.value)} className="max-w-full items-center gap-1">
            <Chip
              testID={option.testID}
              label={option.label}
              selected={value.includes(option.value)}
              disabled={disabled}
              accessibilityHint={hint}
              onPress={disabled ? undefined : () => toggle(option.value)}
            />
            {hint ? (
              <HintText
                testID={option.testID ? `${option.testID}-hint` : undefined}
                variant="muted"
                className="text-center text-xs"
              >
                {hint}
              </HintText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
