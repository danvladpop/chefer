import { forwardRef, useCallback, useRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@chefer/utils';
import { useScrollFieldIntoView } from './keyboard-aware-scroll-view';

export interface InputProps extends TextInputProps {
  className?: string;
}

/**
 * Themed text input — 44pt min height, semantic border/background tokens.
 * Forwards its ref to the underlying `TextInput` so callers can `.focus()`
 * it (return-key chaining) or `.measureLayout()` it (scrolling it clear of
 * the keyboard) — see `KeyboardAwareScrollView` and `useFieldChain`.
 *
 * Inside a `KeyboardAwareScrollView` or a `Sheet` body, focusing the field
 * also scrolls it clear of the keyboard (UX-FOOD-10, UX-PLAN-10) — outside
 * one this is a harmless no-op.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, onFocus, ...props },
  ref,
) {
  const innerRef = useRef<TextInput | null>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const setRef = useCallback(
    (node: TextInput | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  return (
    <TextInput
      ref={setRef}
      className={cn(
        'h-11 rounded-md border border-input bg-background px-3 text-base text-foreground',
        className,
      )}
      placeholderTextColor="#9ca3af"
      onFocus={(event) => {
        scrollFieldIntoView(innerRef.current);
        onFocus?.(event);
      }}
      {...props}
    />
  );
});
