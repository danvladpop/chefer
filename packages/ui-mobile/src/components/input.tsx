import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@chefer/utils';

export interface InputProps extends TextInputProps {
  className?: string;
  /**
   * Visible/field label. Used as the default `accessibilityLabel` so a
   * placeholder-only field is still announced (X-09). An explicit
   * `accessibilityLabel` wins; without either, the placeholder is the fallback.
   */
  label?: string;
}

/**
 * Themed text input — 44pt MIN height (`min-h-11 py-2`, never a fixed `h-11`:
 * at large OS text sizes the value grows and a fixed height clipped it, X-08),
 * semantic border/background tokens. Forwards its ref to the underlying
 * `TextInput` so callers can `.focus()` it (return-key chaining) or
 * `.measureLayout()` it (scrolling it clear of the keyboard) — see
 * `KeyboardAwareScrollView` and `useFieldChain`.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, label, ...props },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      accessibilityLabel={label ?? props.placeholder}
      className={cn(
        'min-h-11 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground',
        className,
      )}
      placeholderTextColor="#9ca3af"
      {...props}
    />
  );
});
