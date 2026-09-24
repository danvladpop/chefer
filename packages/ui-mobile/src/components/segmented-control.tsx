import { Pressable, Text, View } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@chefer/utils';

// Every segment keeps a 44pt hit area; `sm` only shrinks the label.
const segmentTextVariants = cva('font-medium', {
  variants: {
    size: {
      default: 'text-sm',
      sm: 'text-xs',
    },
    selected: {
      true: 'text-foreground',
      false: 'text-muted-foreground',
    },
  },
  defaultVariants: { size: 'default', selected: false },
});

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  testID?: string;
}

export interface SegmentedControlProps<T extends string> {
  size?: VariantProps<typeof segmentTextVariants>['size'];
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  testID?: string;
  /** Accessible name for the whole group, e.g. "App mode". */
  accessibilityLabel?: string;
}

/** iOS-style segmented control: one selected segment, equal widths. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size,
  className,
  testID,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className={cn('flex-row rounded-lg bg-muted p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (!selected) {
                onChange(option.value);
              }
            }}
            className={cn(
              'min-h-11 flex-1 items-center justify-center rounded-md px-3',
              selected && 'bg-background shadow-sm',
            )}
          >
            <Text className={segmentTextVariants({ size, selected })}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
