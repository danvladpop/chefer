import { InputAccessoryView, Platform, Pressable, View } from 'react-native';
import { Text } from './text';

export interface NumericReturnBarProps {
  /** Must match the `inputAccessoryViewID` set on every field in the group. */
  nativeID: string;
  /** "Next" while an earlier field in the chain is focused, "Done" on the last one. */
  label: string;
  onPress: () => void;
  testID?: string;
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
