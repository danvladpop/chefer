import Constants from 'expo-constants';

// UX-ACC-08: password fields where the user CHOOSES a password (register, reset)
// declare `newPassword` so iOS offers a strong password and the save-to-Keychain
// prompt after the account exists. The old blanket `oneTimeCode` opt-out (an E2E
// workaround: iOS's Automatic Strong Password overlay covers the field and
// swallows programmatic input in Maestro) disabled both for every real user.
// The opt-out now applies to the development variant only — the one the E2E
// flows run against; the production/TestFlight/App Store build gets the real thing.

type PasswordFieldProps = {
  autoComplete: 'new-password' | 'off';
  textContentType: 'newPassword' | 'oneTimeCode';
};

const NEW_PASSWORD: PasswordFieldProps = {
  autoComplete: 'new-password',
  textContentType: 'newPassword',
};

const NO_STRONG_PASSWORD_OVERLAY: PasswordFieldProps = {
  autoComplete: 'off',
  textContentType: 'oneTimeCode',
};

/** Props for a "choose a password" field, given the build's `appVariant`. */
export function newPasswordFieldProps(appVariant: unknown): PasswordFieldProps {
  return appVariant === 'development' ? NO_STRONG_PASSWORD_OVERLAY : NEW_PASSWORD;
}

/** The running build's choice (see `newPasswordFieldProps`). */
export const NEW_PASSWORD_FIELD_PROPS: PasswordFieldProps = newPasswordFieldProps(
  Constants.expoConfig?.extra?.appVariant,
);
