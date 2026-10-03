import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { fetch as expoFetch } from 'expo/fetch';
import { Button, Text } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { getApiBaseUrl } from '../../../lib/api-url';
import { getToken } from '../../../lib/auth-store';
import { uploadImage } from '../../../lib/media-client';
import { photoPickerOptions, preparePhoto, type PreparedPhoto } from '../../../lib/prepare-photo';
import { recipeFormCopy } from './copy';

export interface PhotoFieldProps {
  /** The committed (uploaded) photo URL, or '' when there is none. */
  imageUrl: string;
  onChange: (url: string) => void;
  /** Offline: picking/changing is disabled with a reason (PAT-17's one exception). */
  disabled?: boolean;
  /**
   * UX-REC-12: fires as an upload starts and ends, so the form can hold Save
   * until the photo URL is committed (a Save tapped mid-upload used to store
   * the recipe without its photo).
   */
  onUploadingChange?: (uploading: boolean) => void;
}

/**
 * T-40.5 photo field: empty → local preview the instant a photo is picked
 * (before the upload even starts) → uploading (dimmed, spinner) → done
 * (`Change photo` / `Remove`) or failed (greyed preview, one of the four
 * server-written sentences, `Try again` re-sends the SAME bytes, `Choose
 * another` re-picks). The recipe saves without a photo either way.
 *
 * Pick → prepare → upload are three separately named steps: pick with
 * `photoPickerOptions()`, shrink on the device with `preparePhoto(asset)`
 * (T-BUG-O1.2), then upload the prepared bytes.
 */
export function PhotoField({
  imageUrl,
  onChange,
  disabled = false,
  onUploadingChange,
}: PhotoFieldProps) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [lastAsset, setLastAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onUploadingChange?.(uploading);
    // The callback is a setter; only the flag changing matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading]);

  const pickPhotoAsset = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    const result = await ImagePicker.launchImageLibraryAsync(photoPickerOptions());
    return !result.canceled ? (result.assets.at(0) ?? null) : null;
  };

  const uploadPreparedPhoto = async (photo: PreparedPhoto): Promise<string> =>
    uploadImage(
      { fetchImpl: expoFetch, apiBaseUrl: getApiBaseUrl(), getToken },
      photo.bytes,
      photo.mime === 'image/png' ? 'image/png' : 'image/jpeg',
    );

  const runUpload = async (asset: ImagePicker.ImagePickerAsset) => {
    setUploading(true);
    setError(null);
    try {
      const prepared = await preparePhoto(asset);
      if (!prepared) throw new Error('That photo could not be read — try another one.');
      const url = await uploadPreparedPhoto(prepared);
      onChange(url);
    } catch (err) {
      setError(userFacingErrorMessage(err, recipeFormCopy.photo.generic));
    } finally {
      setUploading(false);
    }
  };

  const pickAndUpload = async () => {
    const asset = await pickPhotoAsset();
    if (!asset) return;
    setPreviewUri(asset.uri);
    setLastAsset(asset);
    await runUpload(asset);
  };

  const retry = () => {
    if (lastAsset) void runUpload(lastAsset);
  };

  const remove = () => {
    onChange('');
    setPreviewUri(null);
    setLastAsset(null);
    setError(null);
  };

  if (error) {
    return (
      <View className="gap-2">
        <View className="relative">
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              className="h-40 w-full rounded-xl opacity-50"
              resizeMode="cover"
            />
          ) : null}
        </View>
        <View className="flex-row items-start gap-1.5">
          <Ionicons name="warning-outline" size={16} color="#dc2626" />
          <Text testID="rf-photo-error" className="flex-1 text-xs text-destructive">
            {recipeFormCopy.photo.failedTitle} {error}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button
            testID="rf-photo-retry"
            variant="outline"
            disabled={disabled}
            onPress={retry}
            className="flex-1"
          >
            {recipeFormCopy.photo.tryAgain}
          </Button>
          <Button
            testID="rf-photo-choose-another"
            variant="outline"
            disabled={disabled}
            onPress={() => void pickAndUpload()}
            className="flex-1"
          >
            {recipeFormCopy.photo.chooseAnother}
          </Button>
        </View>
      </View>
    );
  }

  if (uploading) {
    return (
      <View className="gap-2">
        <View className="relative">
          <Image
            source={{ uri: previewUri ?? undefined }}
            className="h-40 w-full rounded-xl opacity-50"
            resizeMode="cover"
          />
          <View className="absolute inset-0 items-center justify-center">
            <ActivityIndicator size="large" color="#944a00" />
          </View>
        </View>
        <Text variant="muted" className="text-center text-xs">
          {recipeFormCopy.photo.uploading}
        </Text>
      </View>
    );
  }

  if (imageUrl) {
    return (
      <View className="gap-2">
        <Image source={{ uri: imageUrl }} className="h-40 w-full rounded-xl" resizeMode="cover" />
        <View className="flex-row gap-2">
          <Button
            testID="rf-photo-change"
            variant="outline"
            disabled={disabled}
            onPress={() => void pickAndUpload()}
            className="flex-1"
          >
            {recipeFormCopy.photo.change}
          </Button>
          <Button testID="rf-photo-remove" variant="outline" onPress={remove} className="flex-1">
            {recipeFormCopy.photo.remove}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <Button
      // Keep as "rf-photo" (not "rf-photo-add"): e2e/common/pick-latest-photo.yaml
      // (shared by recipes.flow.yaml and recipe-create-photo.flow.yaml) taps
      // this id to open the picker.
      testID="rf-photo"
      variant="outline"
      disabled={disabled}
      onPress={() => void pickAndUpload()}
    >
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="image-outline" size={16} color={disabled ? '#9ca3af' : '#944a00'} />
        <Text
          className={
            disabled
              ? 'text-sm font-medium text-muted-foreground'
              : 'text-sm font-medium text-primary'
          }
        >
          {disabled ? recipeFormCopy.buttons.needsConnection : recipeFormCopy.photo.add}
        </Text>
      </View>
    </Button>
  );
}
