import { View } from 'react-native';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { recipeFormCopy } from './copy';

export interface FormFooterProps {
  isEdit: boolean;
  /** Missing-summary sentence, or null when the form is complete. */
  missingText: string | null;
  offline: boolean;
  saving: boolean;
  saveError: string | null;
  onPress: () => void;
}

/**
 * PAT-17 sticky footer: the primary button is NEVER silently disabled. It
 * always fires `onPress` — the caller decides whether that means "save" or
 * "scroll to and focus the first problem". Offline is the one exception
 * (PAT-17): nothing is missing, so the button reads `Needs a connection` and
 * really is disabled.
 */
export function FormFooter({
  isEdit,
  missingText,
  offline,
  saving,
  saveError,
  onPress,
}: FormFooterProps) {
  const label = offline
    ? recipeFormCopy.buttons.needsConnection
    : saving
      ? isEdit
        ? recipeFormCopy.buttons.saving
        : recipeFormCopy.buttons.creating
      : isEdit
        ? recipeFormCopy.buttons.save
        : recipeFormCopy.buttons.create;

  return (
    <View className="gap-2 border-t border-border bg-background px-4 pb-2 pt-3">
      {offline ? (
        <Text testID="rf-offline" variant="muted" className="text-center text-xs">
          {recipeFormCopy.save.offline}
        </Text>
      ) : null}
      {saveError ? (
        <Card testID="rf-save-error" className="border-red-200 bg-red-50">
          <Text className="text-sm text-red-600">{saveError}</Text>
        </Card>
      ) : null}
      <Button testID="rf-save" loading={saving} disabled={offline} onPress={onPress}>
        {label}
      </Button>
      {!offline && missingText ? (
        <Text testID="rf-missing" variant="muted" className="text-center text-xs">
          {missingText}
        </Text>
      ) : null}
    </View>
  );
}
