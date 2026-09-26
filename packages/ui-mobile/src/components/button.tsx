import { ActivityIndicator, Text } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@chefer/utils';
import { PressableScale, type PressableScaleProps } from '../motion/pressable-scale';
import { colors } from './theme';

// Same variant vocabulary as @chefer/ui's web Button. All sizes clear the
// 44pt minimum touch target (CLAUDE.md). Built on PressableScale (MO-01):
// scales to 0.97 on press; solid fills also dim via `active:opacity-80`.
// Buttons get no haptic — that would be too much (motion-system.md MO-01).
const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-md active:opacity-80 disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        destructive: 'bg-destructive',
        outline: 'border border-input bg-background',
        secondary: 'bg-secondary',
        ghost: '',
      },
      size: {
        default: 'h-11 px-4',
        sm: 'h-11 px-3',
        lg: 'h-12 px-8',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const buttonTextVariants = cva('text-sm font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      secondary: 'text-secondary-foreground',
      ghost: 'text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface ButtonProps
  extends Omit<PressableScaleProps, 'children'>, VariantProps<typeof buttonVariants> {
  className?: string;
  loading?: boolean;
  /** Plain strings are wrapped in a variant-colored Text automatically. */
  children: React.ReactNode;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  accessibilityState,
  ...props
}: ButtonProps) {
  const isDisabled = (disabled ?? false) || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={isDisabled}
      // `busy` lets a screen reader (and tests) tell which of several buttons
      // is the one working.
      accessibilityState={{ disabled: isDisabled, busy: loading, ...accessibilityState }}
      {...props}
    >
      {loading ? (
        // White only reads on the filled variants; outline/ghost/secondary sit
        // on a light background, where a white spinner was invisible.
        <ActivityIndicator
          size="small"
          color={
            variant === 'outline' || variant === 'ghost' || variant === 'secondary'
              ? colors.primary
              : 'white'
          }
        />
      ) : null}
      {typeof children === 'string' ? (
        <Text className={buttonTextVariants({ variant })}>{children}</Text>
      ) : (
        children
      )}
    </PressableScale>
  );
}
