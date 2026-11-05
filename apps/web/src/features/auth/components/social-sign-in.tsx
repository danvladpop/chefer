'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { capture } from '@/lib/analytics';
import { useT } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { deviceSupportedLocale } from '@chefer/i18n';
import { CURRENT_TERMS_VERSION } from '@chefer/types';
import { detectRegion, userFacingErrorMessage } from '@chefer/utils';
import { useWebSocialProviders } from '../hooks/use-web-social-providers';
import {
  requestAppleCredential,
  SocialCancelledError,
  type SocialSignInPayload,
} from '../lib/social-web';
import { AppleSignInButton } from './apple-sign-in-button';
import { GoogleSignInButton } from './google-sign-in-button';

// "Continue with Google / Apple" for the login and register pages (WP-22).
// Renders nothing until the API reports a provider as configured. Tapping a
// provider IS the consent for a new account: the line under the buttons says
// so, and `acceptLegal: true` is what the API records (TERMS + PRIVACY + AGE).

export function SocialSignIn({
  mode,
  hideDivider = false,
}: {
  mode: 'login' | 'register';
  /** Onboarding V4 puts the providers first, so there is nothing to divide. */
  hideDivider?: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const providers = useWebSocialProviders();
  const [error, setError] = useState<string | null>(null);

  const signIn = trpc.auth.socialSignIn.useMutation({
    meta: { silent: true },
    onSuccess: (result) => {
      // Same as password login: nothing cached for a previous account survives.
      queryClient.clear();
      if (result.isNewUser) capture('signup_completed', {});
      router.push(result.isNewUser ? '/onboarding' : '/dashboard');
      router.refresh();
    },
    onError: (err) => setError(userFacingErrorMessage(err, t('auth.social.sdkErrorWeb'))),
  });

  const submit = useCallback(
    (payload: SocialSignInPayload) => {
      setError(null);
      // Location defaults, as on the register form.
      const region = detectRegion(typeof navigator === 'undefined' ? [] : navigator.languages);
      const deviceLocale = deviceSupportedLocale();
      signIn.mutate({
        ...payload,
        acceptLegal: true,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
        ...(region && { region }),
        ...(deviceLocale && { deviceLocale }),
      });
    },
    [signIn],
  );

  const onSdkError = useCallback(
    (err: Error) => {
      if (err instanceof SocialCancelledError) return;
      setError(t('auth.social.sdkErrorWeb'));
    },
    [t],
  );

  const apple = providers.apple;
  const startApple = useCallback(() => {
    if (!apple) return;
    setError(null);
    requestAppleCredential(apple).then(submit, onSdkError);
  }, [apple, submit, onSdkError]);

  if (!providers.google && !providers.apple) return null;

  return (
    <div data-testid="social-sign-in" className="space-y-3">
      {!hideDivider && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          <span>{t('auth.social.or')}</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {error && (
        <div
          role="alert"
          data-testid="social-sign-in-error"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="space-y-3" aria-busy={signIn.isPending}>
        {providers.google && (
          <GoogleSignInButton
            clientId={providers.google.clientId}
            text={mode === 'register' ? 'signup_with' : 'continue_with'}
            onCredential={submit}
            onError={onSdkError}
          />
        )}
        {providers.apple && <AppleSignInButton disabled={signIn.isPending} onClick={startApple} />}
      </div>

      <p className="text-center text-xs text-muted-foreground" data-testid="social-consent">
        {rich(t, 'auth.social.consent', {
          terms: (
            <Link
              href="/terms"
              target="_blank"
              className="touch-target relative underline underline-offset-4 hover:text-foreground"
            >
              {t('auth.links.terms')}
            </Link>
          ),
          privacy: (
            <Link
              href="/privacy"
              target="_blank"
              className="touch-target relative underline underline-offset-4 hover:text-foreground"
            >
              {t('auth.links.privacy')}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
