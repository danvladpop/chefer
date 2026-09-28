import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Share a generated file (T-39.5, UX-39 §5) ─────────────────────────────────
// "A real export": the file needs a real name so it can be saved to
// Files/Drive, not an unnamed text blob in the share sheet (bug B-53).
//
// iOS: `expo-file-system` (pinned as a direct dependency at exactly the
// version already resolved transitively — 57.0.6 — so the runtime
// fingerprint is unchanged; verified with `expo-updates
// runtimeversion:resolve` before/after the pin, see the PR description)
// writes the JSON to the cache dir under its real filename, then
// `Share.share({ url })` shares that file — the OS share sheet lets it be
// saved anywhere, with the right name and extension.
//
// Android: `Share.share({ url })` with a `file://` URI needs a
// FileProvider + `expo-sharing`, which is the native release (wave 4). Until
// then, Android gets the same titled TEXT share as today — the title still
// carries the real filename, and the content is complete; only the "saved
// as a named file" part waits for the native release.
//
// The snackbar confirmation ("Your export is ready.") is the caller's job —
// this helper only resolves once the OS share sheet has been presented.

export async function shareExportFile(filename: string, contents: string): Promise<void> {
  if (Platform.OS === 'ios') {
    try {
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, contents, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Share.share({ url: uri, title: filename });
      return;
    } catch {
      // Falls through to the text share below — better an unnamed export
      // than none at all.
    }
  }
  await Share.share({ title: filename, message: contents });
}
