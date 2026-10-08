import { forwardRef, useCallback, useId, useRef } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';
import { cn } from '@chefer/utils';
import { useScrollFieldIntoView } from './keyboard-aware-scroll-view';
import { hasNoReturnKey, KeyboardDoneBar } from './numeric-return-bar';

export interface InputProps extends TextInputProps {
  className?: string;
  /**
   * Visible/field label. Used as the default `accessibilityLabel` so a
   * placeholder-only field is still announced (X-09). An explicit
   * `accessibilityLabel` wins; without either, the placeholder is the fallback.
   */
  label?: string;
  /**
   * Opt out of the iOS "Done" accessory a numeric / multiline field gets by
   * default — for a field whose screen already pins its own Done control.
   */
  showDoneBar?: boolean;
}

/**
 * Themed text input — 44pt MIN height (`min-h-11 py-2`, never a fixed `h-11`:
 * at large OS text sizes the value grows and a fixed height clipped it, X-08),
 * semantic border/background tokens. Forwards its ref to the underlying
 * `TextInput` so callers can `.focus()` it (return-key chaining) or
 * `.measureLayout()` it (scrolling it clear of the keyboard) — see
 * `KeyboardAwareScrollView` and `useFieldChain`.
 *
 * Keyboard dismissal (tester feedback 2026-10-04 "keyboards don't close"):
 * a single-line field defaults to `returnKeyType="done"` with
 * `submitBehavior="blurAndSubmit"` — Return submits AND closes the keyboard
 * (a `returnKeyType="next"` field defaults to `submit`, so the keyboard stays up while
 * focus moves to the next field). On iOS a number / decimal / phone
 * pad has no Return key and a multiline field's Return is a newline, so unless
 * the caller already supplies an `inputAccessoryViewID` (a `NumericReturnBar`
 * chain) the field renders its own "Done" accessory that closes the keyboard.
 * Numeric fields that should move on to a "next" field use `useNumericChain`
 * (a Next/Done `NumericReturnBar` per field) and pass its `bind(i)`.
 *
 * Inside a `KeyboardAwareScrollView` or a `Sheet` body, focusing the field
 * also scrolls it clear of the keyboard (UX-FOOD-10, UX-PLAN-10) — outside
 * one this is a harmless no-op.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    className,
    label,
    onFocus,
    inputAccessoryViewID,
    returnKeyType,
    submitBehavior,
    showDoneBar = true,
    ...props
  },
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
  const doneId = `chefer-done-${useId()}`;
  const wantsDoneBar =
    showDoneBar &&
    Platform.OS === 'ios' &&
    inputAccessoryViewID === undefined &&
    (props.multiline === true || hasNoReturnKey(props.keyboardType));
  const isNext = !props.multiline && returnKeyType === 'next';
  return (
    <>
      <TextInput
        ref={setRef}
        accessibilityLabel={label ?? props.placeholder}
        className={cn(
          'min-h-11 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground',
          className,
        )}
        placeholderTextColor="#9ca3af"
        onFocus={(event) => {
          scrollFieldIntoView(innerRef.current);
          onFocus?.(event);
        }}
        returnKeyType={props.multiline ? returnKeyType : (returnKeyType ?? 'done')}
        submitBehavior={
          props.multiline
            ? submitBehavior
            : (submitBehavior ?? (isNext ? 'submit' : 'blurAndSubmit'))
        }
        inputAccessoryViewID={wantsDoneBar ? doneId : inputAccessoryViewID}
        {...props}
      />
      {wantsDoneBar ? (
        <KeyboardDoneBar
          nativeID={doneId}
          testID={props.testID ? `${props.testID}-done` : undefined}
        />
      ) : null}
    </>
  );
});
