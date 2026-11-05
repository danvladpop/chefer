import type { Translator } from '@chefer/i18n';
import { PASSWORD_MIN_LENGTH } from '@chefer/types';

// The form rules live in @chefer/types (shared with the API's limits), so
// their messages are English. The forms hand each message through here to show
// it in the UI language; a message this file does not know is shown as it is.

export const TERMS_REQUIRED_MESSAGE = 'You must agree to the Terms and the Privacy Policy';
export const AGE_REQUIRED_MESSAGE = 'You must confirm you are 16 or older';

export function authValidationMessage(
  t: Translator['t'],
  message: string | undefined,
): string | undefined {
  switch (message) {
    case undefined:
      return undefined;
    case 'Email is required':
      return t('auth.validation.emailRequired');
    case 'Invalid email address':
      return t('auth.validation.emailInvalidShort');
    case 'Password is required':
      return t('auth.validation.passwordRequired');
    case `Password must be at least ${PASSWORD_MIN_LENGTH} characters`:
      return t('auth.validation.passwordMin', { min: PASSWORD_MIN_LENGTH });
    case 'Password too long':
      return t('auth.validation.passwordTooLong');
    case 'Please confirm your password':
      return t('auth.validation.confirmRequired');
    case 'Passwords do not match':
      return t('auth.validation.mismatch');
    case TERMS_REQUIRED_MESSAGE:
      return t('auth.validation.termsRequired');
    case AGE_REQUIRED_MESSAGE:
      return t('auth.validation.ageRequired');
    default:
      return message;
  }
}
