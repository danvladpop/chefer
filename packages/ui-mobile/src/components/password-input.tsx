import { forwardRef, useState } from 'react';
import { Pressable, Text, View, type TextInput } from 'react-native';
import { cn } from '@chefer/utils';
import { Input, type InputProps } from './input';

export interface PasswordInputProps extends Omit<InputProps, 'secureTextEntry'> {
  /**
   * Controlled reveal state — pass it (with `onRevealedChange`) when several
   * fields share one toggle, e.g. password + confirm on register. Uncontrolled
   * (starts hidden) when omitted.
   */
  revealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  /** Hide this field's own Show/Hide control (a sibling field owns the toggle). */
  hideToggle?: boolean;
}

/**
 * `Input` for passwords with a Show/Hide toggle (same affordance as the web
 * auth forms). The toggle's hit area is the full 44pt field height; its
 * testID is `${testID}-toggle`.
 */
export const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  { revealed, onRevealedChange, hideToggle = false, className, testID, ...props },
  ref,
) {
  const [ownRevealed, setOwnRevealed] = useState(false);
  const isRevealed = revealed ?? ownRevealed;

  const toggle = () => {
    const next = !isRevealed;
    if (revealed === undefined) setOwnRevealed(next);
    onRevealedChange?.(next);
  };

  return (
    <View className="relative justify-center">
      <Input
        ref={ref}
        testID={testID}
        secureTextEntry={!isRevealed}
        autoCapitalize="none"
        autoCorrect={false}
        className={cn(!hideToggle && 'pr-16', className)}
        {...props}
      />
      {!hideToggle && (
        <Pressable
          testID={testID ? `${testID}-toggle` : undefined}
          accessibilityRole="button"
          accessibilityLabel={isRevealed ? 'Hide password' : 'Show password'}
          onPress={toggle}
          hitSlop={4}
          className="absolute bottom-0 right-0 top-0 min-w-11 items-center justify-center px-3"
        >
          <Text className="text-sm font-medium text-primary">{isRevealed ? 'Hide' : 'Show'}</Text>
        </Pressable>
      )}
    </View>
  );
});
