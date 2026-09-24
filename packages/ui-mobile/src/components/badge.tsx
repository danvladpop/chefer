import { Text, View, type ViewProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@chefer/utils';

// Same variant names as @chefer/ui's web Badge.
const badgeVariants = cva('flex-row items-center self-start rounded-full px-2.5 py-0.5', {
  variants: {
    variant: {
      default: 'bg-primary',
      secondary: 'bg-secondary',
      destructive: 'bg-destructive',
      outline: 'border border-border',
      success: 'bg-emerald-100',
      warning: 'bg-amber-100',
      info: 'bg-blue-100',
    },
  },
  defaultVariants: { variant: 'default' },
});

const badgeTextVariants = cva('text-xs font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      success: 'text-emerald-800',
      warning: 'text-amber-800',
      info: 'text-blue-800',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps extends ViewProps, VariantProps<typeof badgeVariants> {
  className?: string;
  /** Plain strings are wrapped in a variant-coloured Text automatically. */
  children: React.ReactNode;
}

/** Small status pill (PR, Deload, Synced…). Display-only — not a touch target. */
export function Badge({ variant, className, children, ...props }: BadgeProps) {
  return (
    <View className={cn(badgeVariants({ variant }), className)} {...props}>
      {typeof children === 'string' || typeof children === 'number' ? (
        <Text className={badgeTextVariants({ variant })}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
