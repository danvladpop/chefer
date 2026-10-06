'use client';

import { useCallback, useState } from 'react';
import { AppleSignInButton } from '@/features/auth/components/apple-sign-in-button';
import { GoogleSignInButton } from '@/features/auth/components/google-sign-in-button';
import { useWebSocialProviders } from '@/features/auth/hooks/use-web-social-providers';
import {
  requestAppleCredential,
  SocialCancelledError,
  type SocialSignInPayload,
} from '@/features/auth/lib/social-web';
import { trpc } from '@/lib/trpc';
import { SOCIAL_PROVIDER_LABELS, type LinkedIdentity, type SocialProvider } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

// ─── Sign-in methods (WP-22) ─────────────────────────────────────────────────
// Which Google/Apple accounts are connected, connect/disconnect, and — for an
// account with no password — a way to add one (the reset link doubles as
// "set a password"). Hidden when there is nothing to show: no connected
// accounts and no provider the web can offer. Mirrors the mobile card.

const SDK_ERROR_COPY =
  'We couldn’t reach the sign-in service. Check your connection and try again.';

export function SignInMethodsCard() {
  const utils = trpc.useUtils();
  const providers = useWebSocialProviders();
  const { data } = trpc.auth.linkedIdentities.useQuery(undefined, { staleTime: 30_000 });
  const { data: me } = trpc.auth.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [error, setError] = useState<string | null>(null);

  const onUpdated = (next: NonNullable<typeof data>) =>
    utils.auth.linkedIdentities.setData(undefined, next);
  const link = trpc.auth.linkIdentity.useMutation({
    meta: { silent: true },
    onSuccess: onUpdated,
    onError: (err) => setError(userFacingErrorMessage(err, SDK_ERROR_COPY)),
  });
  const unlink = trpc.auth.unlinkIdentity.useMutation({
    meta: { silent: true },
    onSuccess: onUpdated,
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const reset = trpc.auth.requestPasswordReset.useMutation({ meta: { silent: true } });

  const connect = useCallback(
    (payload: SocialSignInPayload) => {
      setError(null);
      link.mutate(payload);
    },
    [link],
  );
  const onSdkError = useCallback((err: Error) => {
    if (!(err instanceof SocialCancelledError)) setError(SDK_ERROR_COPY);
  }, []);

  if (!data) return null;
  const identities = data.identities;
  const offered: { provider: SocialProvider; connected: LinkedIdentity | undefined }[] = (
    ['GOOGLE', 'APPLE'] as const
  )
    .map((provider) => ({ provider, connected: identities.find((i) => i.provider === provider) }))
    .filter(({ provider, connected }) =>
      connected ? true : provider === 'GOOGLE' ? providers.google : providers.apple,
    );
  if (offered.length === 0) return null;

  const busy = link.isPending || unlink.isPending;
  const apple = providers.apple;

  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      data-testid="sign-in-methods-card"
    >
      <h2 className="mb-1 font-semibold text-gray-800">Sign-in methods</h2>
      <p className="mb-3 text-sm text-gray-600">
        Connect Google or Apple to sign in without typing your password.
      </p>

      <ul className="space-y-3">
        {offered.map(({ provider, connected }) => (
          <li
            key={provider}
            data-testid={`sign-in-method-${provider.toLowerCase()}`}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {SOCIAL_PROVIDER_LABELS[provider]}
              </p>
              <p className="truncate text-xs text-gray-600">
                {connected ? (connected.email ?? 'Connected') : 'Not connected'}
              </p>
            </div>
            {connected ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  unlink.mutate({ provider });
                }}
              >
                Disconnect
              </Button>
            ) : provider === 'GOOGLE' && providers.google ? (
              <div className="w-full sm:w-64">
                <GoogleSignInButton
                  clientId={providers.google.clientId}
                  onCredential={connect}
                  onError={onSdkError}
                />
              </div>
            ) : apple ? (
              <div className="w-full sm:w-64">
                <AppleSignInButton
                  label="Connect Apple"
                  disabled={busy}
                  onClick={() => {
                    setError(null);
                    requestAppleCredential(apple).then(connect, onSdkError);
                  }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" data-testid="sign-in-methods-error" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!data.hasPassword && (
        <div className="mt-4 border-t pt-3" data-testid="sign-in-methods-no-password">
          <p className="text-sm text-gray-700">
            You don’t have a password yet. Add one so you can also sign in with your email.
          </p>
          {me?.email &&
            (reset.isSuccess ? (
              <p role="status" className="mt-2 text-sm text-gray-700">
                We sent a link to {me.email}. Open it to choose a password.
              </p>
            ) : (
              <Button
                variant="outline"
                className="mt-2"
                disabled={reset.isPending}
                onClick={() => reset.mutate({ email: me.email })}
              >
                {reset.isPending ? 'Sending…' : 'Email me a link to set a password'}
              </Button>
            ))}
          {reset.isError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {userFacingErrorMessage(reset.error)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
