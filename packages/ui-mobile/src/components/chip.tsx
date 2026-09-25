import { Pressable, Text, View } from 'react-native';
import { cva } from 'class-variance-authority';
import { cn } from '@chefer/utils';

const chipVariants = cva('min-h-11 flex-row items-center justify-center rounded-full border px-4', {
  variants: {
    selected: {
      true: 'border-primary bg-primary',
      false: 'border-border bg-background',
    },
  },
  defaultVariants: { selected: false },
});

const chipTextVariants = cva('text-sm font-medium', {
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
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  testID?: string | undefined;
}

/** Pill toggle — filters, RIR answers, weekday pickers. 44pt tall. */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  className,
  testID,
}: ChipProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(chipVariants({ selected }), disabled && 'opacity-50', className)}
    >
      <Text className={chipTextVariants({ selected })}>{label}</Text>
    </Pressable>
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
      {options.map((option) => (
        <Chip
          key={String(option.value)}
          testID={option.testID}
          label={option.label}
          selected={value.includes(option.value)}
          onPress={() => toggle(option.value)}
        />
      ))}
    </View>
  );
}
