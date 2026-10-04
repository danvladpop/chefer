import { useCallback, useState } from 'react';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { detectRegion } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { setToken } from '../../../lib/auth-store';
import { trpc } from '../../../lib/trpc';
import { clearAccountDeletedNotice } from '../account-deleted-notice';
import { AUTH_COPY } from '../copy';
import { clearPendingOnboarding, requestOnboarding } from '../pending-onboarding';
import { clearRegisterDraft } from '../register-draft';
import { clearSessionExpired } from '../session-expired';
import {
  requestAppleCredential,
  requestGoogleCredential,
  type SocialSignInPayload,
} from './social-credentials';
import { socialErrorMessage } from './social-errors';
import { currentPlatform, type SocialProviders } from './social-providers';

export type SocialProviderKey = 'apple' | 'google';

/** Runs the native sheet for one provider, or throws Cancelled / Sdk errors. */
export async function requestProviderCredential(
  providers: SocialProviders,
  provider: SocialProviderKey,
): Promise<SocialSignInPayload> {
  if (provider === 'apple' && providers.apple) return requestAppleCredential(providers.apple);
  if (provider === 'google' && providers.google) {
    return requestGoogleCredential(
      providers.google.module,
      providers.google.config,
      currentPlatform(),
    );
  }
  throw new Error(`Sign-in provider "${provider}" is not available on this device`);
}

/**
 * Continue with Apple / Google (WP-22). The session handling mirrors email
 * sign-in / registration exactly:
 *  - existing account → token stored, session-expired / account-deleted
 *    notices cleared (login.tsx);
 *  - new account → onboarding is requested BEFORE the token is stored, so the
 *    first protected screen the auth gate mounts redirects to /onboarding
 *    (R-18b, register.tsx), the register draft is dropped and signup counted.
 * `setToken` empties the query cache itself (UX-ACC-02).
 *
 * Tapping a provider button IS the consent for a new account: the screen shows
 * "By continuing you agree to the Terms and Privacy Policy and confirm you are
 * 16 or older", so `acceptLegal: true` and the terms version are always sent.
 */
export function useSocialSignIn(providers: SocialProviders) {
  const [error, setError] = useState<string | null>(null);
  // The provider whose native sheet or API request is in flight.
  const [active, setActive] = useState<SocialProviderKey | null>(null);

  const signIn = trpc.auth.socialSignIn.useMutation({
    meta: { silent: true },
    onSuccess: async (data) => {
      if (!data.session) {
        setError(AUTH_COPY.socialNoSession);
        return;
      }
      if (data.isNewUser) {
        track('signup_completed', {});
        clearRegisterDraft();
        requestOnboarding();
        try {
          await setToken(data.session.token);
        } catch (err) {
          clearPendingOnboarding();
          throw err;
        }
      } else {
        await setToken(data.session.token);
      }
      clearSessionExpired();
      clearAccountDeletedNotice();
    },
    onError: (err) => setError(socialErrorMessage(err)),
    onSettled: () => setActive(null),
  });

  const start = useCallback(
    async (provider: SocialProviderKey) => {
      if (active || signIn.isPending) return;
      setError(null);
      setActive(provider);
      let payload: SocialSignInPayload;
      try {
        payload = await requestProviderCredential(providers, provider);
      } catch (err) {
        setActive(null);
        setError(socialErrorMessage(err));
        return;
      }
      const region = detectRegion();
      signIn.mutate({
        ...payload,
        acceptLegal: true,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        ...(region ? { region } : {}),
      });
    },
    [providers, active, signIn],
  );

  return { start, error, busy: active };
}
