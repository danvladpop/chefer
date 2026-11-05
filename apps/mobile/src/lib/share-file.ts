import { Platform, Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Share a generated file (T-39.5, UX-39 §5) ─────────────────────────────────
// "A real export": the file needs a real name so it can be saved to
// Files/Drive, not an unnamed text blob in the share sheet (bug B-53). Used by
// the account-data JSON export (`application/json`) and the gym CSV export
// (`text/csv`).
//
// Both platforms first write the contents to the cache dir under the real
// filename with `expo-file-system/legacy` (a direct dependency, pinned at
// exactly 57.0.6).
//
// iOS: `Share.share({ url })` shares that file — the OS share sheet lets it be
// saved anywhere, with the right name and extension.
//
// Android: `Share.share({ url })` with a `file://` URI does not work (it needs
// a FileProvider), so the file goes through `expo-sharing`'s `shareAsync`,
// which brings its own FileProvider and takes the MIME type. `expo-sharing` is
// the wave-4 native release (runtime fingerprint change, see infrastructure.md
// §11). Binaries built before it do not contain the native module — importing
// `expo-sharing` there throws at import time — so the module is looked up first
// (same pattern as prepare-photo.ts) and loaded lazily. Without it, Android
// keeps the titled TEXT share it always had: the title carries the real
// filename and the content is complete; only the "saved as a named file" part
// needs the newer binary.
//
// G1: the full data export is a ZIP. Its bytes arrive base64 and are written
// with `encoding: 'base64'` (expo-file-system's Base64 encoding — the same
// native module, so no fingerprint change). A ZIP has no text form, so when
// the file can't be shared (an Android binary without expo-sharing,
// `canShareBinaryFiles()` false) the helper throws instead of sharing the
// base64 as text; the caller offers the JSON export there instead.
//
// The snackbar confirmation ("Your export is ready.") is the caller's job —
// this helper resolves once the OS share sheet has been presented, with `false`
// when the user cancelled it (iOS reports `dismissedAction`; UX-ACC-22: a
// cancelled share is not "ready").

type SharingModule = typeof import('expo-sharing');

export const JSON_MIME = 'application/json';
export const CSV_MIME = 'text/csv';
export const ZIP_MIME = 'application/zip';

// iOS Uniform Type Identifiers for the MIME types this helper is used with.
const UTI_BY_MIME: Record<string, string> = {
  [JSON_MIME]: 'public.json',
  [CSV_MIME]: 'public.comma-separated-values-text',
  [ZIP_MIME]: 'public.zip-archive',
};

/** True when this binary contains the `expo-sharing` native module. */
export function canShareFiles(): boolean {
  return requireOptionalNativeModule('ExpoSharing') != null;
}

/** True when a binary file (a ZIP) can be shared as a real file on this device. */
export function canShareBinaryFiles(): boolean {
  return Platform.OS === 'ios' || (Platform.OS === 'android' && canShareFiles());
}

export async function shareExportFile(
  filename: string,
  contents: string,
  mimeType: string = JSON_MIME,
  encoding: 'utf8' | 'base64' = 'utf8',
): Promise<boolean> {
  const isIos = Platform.OS === 'ios';
  if (canShareBinaryFiles()) {
    try {
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, contents, {
        encoding:
          encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
      });
      if (isIos) {
        const result = await Share.share({ url: uri, title: filename });
        return result.action !== Share.dismissedAction;
      } else {
        // Inline require so the module (whose import throws on an older
        // binary) only loads once canShareFiles() has confirmed it is there.
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module, see above
        const Sharing = require('expo-sharing') as SharingModule;
        await Sharing.shareAsync(uri, {
          mimeType,
          dialogTitle: filename,
          UTI: UTI_BY_MIME[mimeType],
        });
      }
      return true;
    } catch (err) {
      // A ZIP has no text form to fall back to.
      if (encoding === 'base64') throw err;
      // Falls through to the text share below — better an unnamed export
      // than none at all.
    }
  }
  if (encoding === 'base64') throw new Error('This device cannot share files');
  const result = await Share.share({ title: filename, message: contents });
  return result.action !== Share.dismissedAction;
}
