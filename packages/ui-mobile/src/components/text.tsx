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
 * Dynamic Type still scales text, but capped at 2.0× by default: at the AX
 * sizes (up to ~3.1×) labels collided and ran off-screen — "M TU W TH",
 * "Calories0 / 2728" (audit F-M-X-5-1). Dense controls (chips, segmented
 * controls, steppers) pass a tighter 1.6× cap. WP-04 raised both (was 1.8 /
 * 1.3): at +30 % a user who needs larger text — the tester's trainer who
 * could not read the app without glasses — got almost nothing, so the
 * primitives now wrap / grow (`min-h-11`, no fixed heights) instead of
 * relying on a low cap to survive.
 */
export const DEFAULT_MAX_FONT_SCALE = 2.0;
export const DENSE_MAX_FONT_SCALE = 1.6;

export function Text({ className, variant, maxFontSizeMultiplier, ...props }: TextProps) {
  return (
    <RNText
      className={cn(textVariants({ variant }), className)}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? DEFAULT_MAX_FONT_SCALE}
      {...props}
    />
  );
}
