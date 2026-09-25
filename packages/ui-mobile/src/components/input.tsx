import { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@chefer/utils';

export interface InputProps extends TextInputProps {
  className?: string;
}

/**
 * Themed text input — 44pt min height, semantic border/background tokens.
 * Forwards its ref to the underlying `TextInput` so callers can `.focus()`
 * it (return-key chaining) or `.measureLayout()` it (scrolling it clear of
 * the keyboard) — see `KeyboardAwareScrollView` and `useFieldChain`.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      className={cn(
        'h-11 rounded-md border border-input bg-background px-3 text-base text-foreground',
        className,
      )}
      placeholderTextColor="#9ca3af"
      {...props}
    />
  );
});
