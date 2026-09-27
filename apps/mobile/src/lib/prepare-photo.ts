// T-BUG-O1.2 (O-18 root cause): shrink a picked photo on the device before it
// is uploaded (recipe photo) or scanned (Snap-to-log). A phone camera photo is
// 3–10 MB; a recipe card or a vision estimate needs nowhere near 12–48 MP, so
// the long edge goes to 2048 px at JPEG 0.8 (~0.5–1 MB).
//
// expo-image-manipulator is a native module that only binaries built after it
// was added contain. Importing it on an older binary throws at import time, so
// the module is looked up first and loaded lazily; without it the pick falls
// back to T-BUG-O1's path (picker re-encode at 0.5 + the client size check).
import { requireOptionalNativeModule } from 'expo';
import type { ImagePickerAsset, ImagePickerOptions } from 'expo-image-picker';
import { base64ToBytes, SOMETHING_WRONG_MESSAGE, type ImageMime } from './media-client';

type ManipulatorModule = typeof import('expo-image-manipulator');

export const PHOTO_MAX_EDGE = 2048;
export const PHOTO_JPEG_QUALITY = 0.8;

export type PreparedPhoto = { bytes: Uint8Array; mime: ImageMime };

/** The resize that brings the long edge down to `maxEdge`, or null if it already fits. */
export function resizeFor(
  width: number,
  height: number,
  maxEdge = PHOTO_MAX_EDGE,
): { width: number } | { height: number } | null {
  // Unknown dimensions (0) — resize anyway; an upscale beats an oversize upload.
  if (width <= 0 || height <= 0) return { width: maxEdge };
  if (width <= maxEdge && height <= maxEdge) return null;
  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

export function canResizeOnDevice(): boolean {
  return requireOptionalNativeModule('ExpoImageManipulator') != null;
}

/**
 * Picker options for a photo that goes through `preparePhoto`. With the
 * manipulator the picker hands over the original file (no base64 — a 48 MP
 * photo as a base64 string is ~30 MB of JS memory); without it, the old
 * base64 + quality 0.5 path.
 */
export function photoPickerOptions(): ImagePickerOptions {
  return canResizeOnDevice()
    ? { mediaTypes: 'images' }
    : { mediaTypes: 'images', base64: true, quality: 0.5 };
}

/**
 * Turns a picked asset into upload-ready bytes. Returns null when the asset
 * carries nothing usable; throws a user-facing sentence if resizing fails.
 */
export async function preparePhoto(asset: ImagePickerAsset): Promise<PreparedPhoto | null> {
  if (!canResizeOnDevice()) {
    if (!asset.base64) return null;
    // Exactly what the pre-T-BUG-O1.2 call sites sent.
    return {
      bytes: base64ToBytes(asset.base64),
      mime: (asset.mimeType ?? 'image/jpeg') as ImageMime,
    };
  }

  // Inline require so the module (whose import throws on an older binary)
  // only loads once canResizeOnDevice() has confirmed it is there.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module, see above
  const manipulator = require('expo-image-manipulator') as ManipulatorModule;
  const { ImageManipulator, SaveFormat } = manipulator;
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const size = resizeFor(asset.width, asset.height);
    if (size) context.resize(size);
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: PHOTO_JPEG_QUALITY,
        base64: true,
      });
      if (!saved.base64) throw new Error('no base64');
      return { bytes: base64ToBytes(saved.base64), mime: 'image/jpeg' };
    } finally {
      image.release();
    }
  } catch {
    throw new Error(SOMETHING_WRONG_MESSAGE);
  } finally {
    context.release();
  }
}
