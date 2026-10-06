import { useId } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { Text } from './text';

export interface NumericReturnBarProps {
  /** Must match the `inputAccessoryViewID` set on every field in the group. */
  nativeID: string;
  /** "Next" while an earlier field in the chain is focused, "Done" on the last one. */
  label: string;
  onPress: () => void;
  testID?: string | undefined;
}

/**
 * `number-pad` / `decimal-pad` have no Return key at all on iOS (unlike
 * Android, whose IME renders one for the same `keyboardType`, so
 * `returnKeyType` + `onSubmitEditing` alone already works there). This bar is
 * iOS's substitute: give every field in a chain the same `inputAccessoryViewID`
 * as this bar's `nativeID` and it becomes their shared "Next" / "Done"
 * affordance, pinned right above the keyboard.
 *
 * Renders nothing on Android — `InputAccessoryView` doesn't exist there and
 * isn't needed.
 */
export function NumericReturnBar({ nativeID, label, onPress, testID }: NumericReturnBarProps) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View className="flex-row justify-end border-t border-border bg-card px-3 py-1.5">
        <Pressable
          testID={testID}
          accessibilityRole="button"
          onPress={onPress}
          className="min-h-11 min-w-11 items-center justify-center px-2"
        >
          <Text className="text-base font-semibold text-primary">{label}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

/** `keyboardType`s that have no Return key on iOS and so need an accessory to be closed. */
const NO_RETURN_KEY_TYPES: readonly KeyboardTypeOptions[] = [
  'number-pad',
  'decimal-pad',
  'numeric',
  'phone-pad',
];

/** True for the iOS keyboards that have no Return key (number / decimal / phone pads). */
export function hasNoReturnKey(keyboardType: KeyboardTypeOptions | undefined): boolean {
  return keyboardType !== undefined && NO_RETURN_KEY_TYPES.includes(keyboardType);
}

/**
 * A fixed "Done" accessory that just closes the keyboard — for a numeric or
 * multiline field that is NOT part of a Next/Done chain (those use
 * `NumericReturnBar` with their own action). `Input` renders one for you
 * (see `useKeyboardDoneBar` for raw `TextInput`s). iOS only.
 */
export function KeyboardDoneBar({
  nativeID,
  testID,
  label = 'Done',
  onPress,
}: {
  nativeID: string;
  testID?: string | undefined;
  label?: string;
  /** Defaults to closing the keyboard. */
  onPress?: () => void;
}) {
  return (
    <NumericReturnBar
      nativeID={nativeID}
      testID={testID}
      label={label}
      onPress={onPress ?? (() => Keyboard.dismiss())}
    />
  );
}

/**
 * For a raw `TextInput` that is numeric or multiline: spread `inputAccessoryViewID`
 * onto the field and render `bar` once next to it. Both are `undefined`/`null`
 * off iOS, where the OS keyboard already has a dismiss/return affordance.
 *
 * ```tsx
 * const done = useKeyboardDoneBar();
 * // on the field:  keyboardType="decimal-pad"  inputAccessoryViewID={done.inputAccessoryViewID}
 * // once, nearby:  {done.bar}
 * ```
 */
export function useKeyboardDoneBar(testID?: string): {
  inputAccessoryViewID: string | undefined;
  bar: React.ReactNode;
} {
  const id = useId();
  if (Platform.OS !== 'ios') return { inputAccessoryViewID: undefined, bar: null };
  const nativeID = `chefer-done-${id}`;
  return {
    inputAccessoryViewID: nativeID,
    bar: <KeyboardDoneBar nativeID={nativeID} testID={testID} />,
  };
}

/**
 * Props for a one-off single-line field with no "next" field and no submit
 * action of its own (a standalone label, note, name…): Return reads "Done" and
 * closes the keyboard. Spread it: `<Input {...DONE_FIELD_PROPS} />`.
 */
export const DONE_FIELD_PROPS = {
  returnKeyType: 'done',
  submitBehavior: 'blurAndSubmit',
  onSubmitEditing: () => Keyboard.dismiss(),
} as const;
