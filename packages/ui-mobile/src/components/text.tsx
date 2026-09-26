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

/**
 * Dynamic Type still scales text, but capped at 1.8× by default: at the AX
 * sizes (up to ~3.1×) labels collided and ran off-screen — "M TU W TH",
 * "Calories0 / 2728" (audit F-M-X-5-1). Dense controls (chips, segmented
 * controls) pass a tighter cap.
 */
export const DEFAULT_MAX_FONT_SCALE = 1.8;
export const DENSE_MAX_FONT_SCALE = 1.3;

export function Text({ className, variant, maxFontSizeMultiplier, ...props }: TextProps) {
  return (
    <RNText
      className={cn(textVariants({ variant }), className)}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? DEFAULT_MAX_FONT_SCALE}
      {...props}
    />
  );
}
