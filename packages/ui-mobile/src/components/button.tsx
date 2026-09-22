import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@chefer/utils';

// Same variant vocabulary as @chefer/ui's web Button. All sizes clear the
// 44pt minimum touch target (CLAUDE.md).
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
  extends Omit<PressableProps, 'children'>, VariantProps<typeof buttonVariants> {
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
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={(disabled ?? false) || loading}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color="white" /> : null}
      {typeof children === 'string' ? (
        <Text className={buttonTextVariants({ variant })}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
