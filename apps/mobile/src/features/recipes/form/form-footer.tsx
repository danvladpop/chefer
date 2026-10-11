import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { TrainButton } from '../../shell/train/train-button';
import { recipeFormCopy } from './copy';

export interface FormFooterProps {
  isEdit: boolean;
  /** Missing-summary sentence, or null when the form is complete. */
  missingText: string | null;
  offline: boolean;
  saving: boolean;
  saveError: string | null;
  /** UX-REC-12: a photo is still uploading — Save waits for it. */
  photoUploading?: boolean;
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
  photoUploading = false,
  onPress,
}: FormFooterProps) {
  const label = offline
    ? recipeFormCopy.buttons.needsConnection
    : photoUploading
      ? recipeFormCopy.buttons.uploadingPhoto
      : saving
        ? isEdit
          ? recipeFormCopy.buttons.saving
          : recipeFormCopy.buttons.creating
        : isEdit
          ? recipeFormCopy.buttons.save
          : recipeFormCopy.buttons.create;

  return (
    <View className="gap-2 border-t border-separator bg-surface px-4 pb-2 pt-3">
      {offline ? (
        <Text testID="rf-offline" className="text-center text-caption text-label-secondary">
          {recipeFormCopy.save.offline}
        </Text>
      ) : null}
      {saveError ? (
        <View
          testID="rf-save-error"
          className="rounded-card border border-danger bg-surface px-4 py-3"
        >
          <Text className="text-callout text-danger">{saveError}</Text>
        </View>
      ) : null}
      <TrainButton
        testID="rf-save"
        size="lg"
        label={label}
        loading={saving}
        disabled={offline || photoUploading}
        onPress={onPress}
      />
      {photoUploading ? (
        <Text testID="rf-photo-wait" className="text-center text-caption text-label-secondary">
          {recipeFormCopy.photo.waitingToSave}
        </Text>
      ) : null}
      {!offline && !photoUploading && missingText ? (
        <Text testID="rf-missing" className="text-center text-caption text-label-secondary">
          {missingText}
        </Text>
      ) : null}
    </View>
  );
}
