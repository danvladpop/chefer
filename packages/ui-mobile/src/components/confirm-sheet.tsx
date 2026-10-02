import { Switch, View } from 'react-native';
import { Button } from './button';
import { Sheet } from './sheet';
import { Text } from './text';
import { colors } from './theme';

export interface ConfirmSheetOption {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

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
  /**
   * PAT-5 — "keep my changes": one or more switches between the body and the
   * buttons (Regenerate's "Keep the 4 meals you chose", downgrade's "you'll
   * keep / you'll lose"). Each gets `${testID}-option-{i}`, the switch
   * `${testID}-option-{i}-switch`.
   */
  options?: ConfirmSheetOption[];
  /**
   * UX-PLAN-03 — the confirmed action is running: the confirm button shows a
   * spinner and ignores presses (no multi-fire — Regenerate used to send one
   * generation per tap and burn the free quota).
   */
  busy?: boolean;
  /**
   * UX-PLAN-03 — why the confirmed action failed (already user-facing text,
   * e.g. the free-quota message). Shown above the buttons, so the sheet never
   * stays open silently after a failure.
   */
  error?: string | null | undefined;
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
  options,
  busy = false,
  error,
  testID,
}: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      <Text testID={`${testID}-body`}>{body}</Text>
      {options && options.length > 0 ? (
        <View className="gap-3 py-1">
          {options.map((option, i) => (
            <View
              key={option.label}
              testID={`${testID}-option-${i}`}
              className="flex-row items-center justify-between gap-3"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-medium">{option.label}</Text>
                {option.detail ? (
                  <Text variant="muted" className="text-xs">
                    {option.detail}
                  </Text>
                ) : null}
              </View>
              <Switch
                testID={`${testID}-option-${i}-switch`}
                accessibilityLabel={option.label}
                value={option.value}
                onValueChange={option.onChange}
                trackColor={{ true: colors.primary, false: colors.neutral }}
              />
            </View>
          ))}
        </View>
      ) : null}
      {error ? (
        <Text testID={`${testID}-error`} accessibilityRole="alert" className="text-sm text-red-600">
          {error}
        </Text>
      ) : null}
      <View className="gap-2 pt-2">
        <Button
          testID={`${testID}-confirm`}
          size="lg"
          variant={destructive ? 'destructive' : 'default'}
          loading={busy}
          onPress={() => {
            if (!busy) onConfirm();
          }}
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
