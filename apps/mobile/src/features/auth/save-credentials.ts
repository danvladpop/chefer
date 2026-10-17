import { requireOptionalNativeModule } from 'expo';

// F8 (docs/research/password-autofill.md §10–§12): after a successful email
// sign-up or a typed sign-in, offer the credential to the password manager.
//
// Android only: React Native never commits the autofill session, so Google
// never offers to save on its own; the local `chefer-credentials` Expo module
// (apps/mobile/modules/chefer-credentials) asks Credential Manager instead.
// iOS needs nothing: its own prompt fires when the auth screens unmount, and an
// explicit save there stacked a second "Save Password?" sheet (§11). The module
// exists only on Android, so the lookup is null on iOS.
//
// Binaries built before 1.0.2 have no module either: this is then a no-op, so
// the same JS ships to them by OTA. The account already exists when this runs,
// so a cancel or failure is logged and never shown.

/** What the native module reports; logged only. */
type SaveResult = 'saved' | 'cancelled' | 'unavailable';

type CheferCredentialsModule = {
  savePassword(username: string, password: string): Promise<SaveResult>;
};

export async function saveCredentials(email: string, password: string): Promise<void> {
  const native = requireOptionalNativeModule<CheferCredentialsModule>('CheferCredentials');
  if (!native) return;
  try {
    const result = await native.savePassword(email.trim(), password);
    // Device logs (logcat) only, like the bundle line in app/_layout.tsx.
    // eslint-disable-next-line no-console
    console.info(`[credentials] save: ${result}`);
  } catch (err) {
    // The message only: the password must never reach a log.
    // eslint-disable-next-line no-console
    console.info(`[credentials] save failed: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
