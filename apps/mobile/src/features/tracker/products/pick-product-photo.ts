import * as ImagePicker from 'expo-image-picker';
import { bytesToBase64 } from '../../../lib/media-client';
import { photoPickerOptions, preparePhoto } from '../../../lib/prepare-photo';

// Packaged products (ADR 0002, stage 1): a barcode or a nutrition label is
// just a photo — taken with the image picker the app already ships, shrunk on
// the device, and sent to the API as base64. No new native module, so it
// reaches every installed binary over the air. A live scanner replaces the
// barcode photo in a later store build (lane C) and calls the same lookup.

export type PickedProductPhoto = {
  imageBase64: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
};

/** `denied` = camera permission refused (the caller offers Settings or the library). */
export async function pickProductPhoto(
  source: 'camera' | 'library',
): Promise<PickedProductPhoto | 'denied' | null> {
  const options = photoPickerOptions();
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return 'denied';
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets.at(0);
  if (!asset) return null;
  const photo = await preparePhoto(asset);
  if (!photo) return null;
  return { imageBase64: bytesToBase64(photo.bytes), mimeType: photo.mime };
}
