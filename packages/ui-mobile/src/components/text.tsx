import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@chefer/utils';

const textVariants = cva('text-foreground', {
  variants: {
    variant: {
      default: 'text-base',
      muted: 'text-sm text-muted-foreground',
      label: 'text-sm font-medium',
      title: 'text-2xl font-bold',
      heading: 'text-lg font-semibold',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface TextProps extends RNTextProps, VariantProps<typeof textVariants> {
  className?: string;
}

export function Text({ className, variant, ...props }: TextProps) {
  return <RNText className={cn(textVariants({ variant }), className)} {...props} />;
}
