import { View } from 'react-native';
import { Button } from './button';
import { Sheet } from './sheet';
import { Text } from './text';

export interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Red confirm button (discard, remove…). */
  destructive?: boolean;
  /** Children get `${testID}-body`, `-confirm`, `-cancel` (plus Sheet's `-title`, `-close`). */
  testID: string;
}

/**
 * A yes/no bottom sheet: a sentence, a primary (or destructive) confirm and a
 * cancel that closes. Promoted from the gym workout screen (G4-B) so every
 * "are you sure?" in the app looks the same.
 */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  testID,
}: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <Text testID={`${testID}-body`}>{body}</Text>
      <View className="gap-2 pt-2">
        <Button
          testID={`${testID}-confirm`}
          size="lg"
          variant={destructive ? 'destructive' : 'default'}
          onPress={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button testID={`${testID}-cancel`} size="lg" variant="outline" onPress={onClose}>
          {cancelLabel}
        </Button>
      </View>
    </Sheet>
  );
}
