import { SOCIAL_AUTH_MESSAGES } from '@chefer/types';
import { userFacingErrorMessage } from '@chefer/utils';
import { AUTH_COPY } from '../copy';
import { SocialCancelledError, SocialSdkError } from './social-credentials';

// What a failed provider sign-in says (WP-22). Cancelling the native sheet
// says nothing at all (null).

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('data' in error)) return null;
  const { data } = error as { data?: { code?: unknown } | null };
  return typeof data?.code === 'string' ? data.code : null;
}

/**
 * The line to show, or null for "show nothing" (the user cancelled).
 *
 * UNAUTHORIZED from `auth.socialSignIn` means "the provider's token did not
 * verify" — not "your Chefer session expired". It is shown as the plain
 * "couldn't verify" message; the signed-out login screen has no session for
 * the 401 handler to end, and nothing here marks one as expired.
 */
export function socialErrorMessage(error: unknown): string | null {
  if (error instanceof SocialCancelledError) return null;
  if (error instanceof SocialSdkError) return AUTH_COPY.socialSdkError;
  if (errorCode(error) === 'UNAUTHORIZED') return SOCIAL_AUTH_MESSAGES.invalidToken;
  return userFacingErrorMessage(error, AUTH_COPY.socialSdkError);
}
