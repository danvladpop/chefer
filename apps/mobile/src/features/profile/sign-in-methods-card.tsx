import { useState } from 'react';
import { View } from 'react-native';
import { SOCIAL_PROVIDER_LABELS, type LinkedIdentity, type SocialProvider } from '@chefer/types';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { socialErrorMessage } from '../auth/social/social-errors';
import { useSocialProviders } from '../auth/social/social-providers';
import {
  requestProviderCredential,
  type SocialProviderKey,
} from '../auth/social/use-social-sign-in';

// Profile › Sign-in methods (WP-22). Mirrors apps/web SignInMethodsCard: which
// Google/Apple accounts are connected, connect (a fresh provider sign-in →
// auth.linkIdentity), disconnect (auth.unlinkIdentity — the server refuses the
// last way to sign in), and, for an account with no password, a way to add one
// (the reset link doubles as "set a password"). Hidden when there is nothing
// to show: nothing connected and no provider this device can offer.

const PROVIDER_KEY: Record<SocialProvider, SocialProviderKey> = {
  GOOGLE: 'google',
  APPLE: 'apple',
};

export const SIGN_IN_METHODS_COPY = {
  title: 'Sign-in methods',
  intro: 'Connect Google or Apple to sign in without typing your password.',
  notConnected: 'Not connected',
  connected: 'Connected',
  connect: 'Connect',
  disconnect: 'Disconnect',
  noPassword: 'You don’t have a password yet. Add one so you can also sign in with your email.',
  setPassword: 'Email me a link to set a password',
  sending: 'Sending…',
  sentTo: 'We sent a link to',
  sentHint: 'Open it to choose a password.',
} as const;

export function SignInMethodsCard() {
  const utils = trpc.useUtils();
  const providers = useSocialProviders();
  const { data } = trpc.auth.linkedIdentities.useQuery(undefined, { staleTime: 30_000 });
  const me = trpc.auth.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<SocialProvider | null>(null);

  const onUpdated = (next: NonNullable<typeof data>) =>
    utils.auth.linkedIdentities.setData(undefined, next);
  const link = trpc.auth.linkIdentity.useMutation({
    meta: { silent: true },
    onSuccess: onUpdated,
    onError: (err) => setError(socialErrorMessage(err)),
  });
  const unlink = trpc.auth.unlinkIdentity.useMutation({
    meta: { silent: true },
    onSuccess: onUpdated,
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const reset = trpc.auth.requestPasswordReset.useMutation({ meta: { silent: true } });

  if (!data) return null;
  const offerable: Record<SocialProvider, boolean> = {
    GOOGLE: providers.google !== null,
    APPLE: providers.apple !== null,
  };
  const rows = (['GOOGLE', 'APPLE'] as const)
    .map((provider) => ({
      provider,
      connected: data.identities.find((i) => i.provider === provider),
    }))
    .filter(({ provider, connected }) => connected !== undefined || offerable[provider]);
  if (rows.length === 0) return null;

  const busy = requesting !== null || link.isPending || unlink.isPending;

  async function connect(provider: SocialProvider) {
    if (busy) return;
    setError(null);
    setRequesting(provider);
    try {
      const { idToken, nonce, authorizationCode } = await requestProviderCredential(
        providers,
        PROVIDER_KEY[provider],
      );
      link.mutate({
        provider,
        idToken,
        ...(nonce ? { nonce } : {}),
        ...(authorizationCode ? { authorizationCode } : {}),
      });
    } catch (err) {
      setError(socialErrorMessage(err));
    } finally {
      setRequesting(null);
    }
  }

  const email = me.data?.email ?? null;
  return (
    <Card testID="profile-sign-in-methods" className="min-w-0">
      <Text className="w-full min-w-0 font-semibold text-gray-900">
        {SIGN_IN_METHODS_COPY.title}
      </Text>
      <Text variant="muted" className="mt-1 w-full min-w-0 text-sm">
        {SIGN_IN_METHODS_COPY.intro}
      </Text>

      <View className="mt-3 gap-3">
        {rows.map(({ provider, connected }) => (
          <MethodRow
            key={provider}
            provider={provider}
            connected={connected}
            busy={busy}
            loading={
              requesting === provider || (link.isPending && link.variables.provider === provider)
            }
            onConnect={() => void connect(provider)}
            onDisconnect={() => {
              setError(null);
              unlink.mutate({ provider });
            }}
          />
        ))}
      </View>

      {error && (
        <Text
          testID="sign-in-methods-error"
          accessibilityRole="alert"
          className="mt-3 text-sm text-red-700"
        >
          {error}
        </Text>
      )}

      {!data.hasPassword && (
        <View
          testID="sign-in-methods-no-password"
          className="mt-4 gap-2 border-t border-border pt-3"
        >
          <Text className="text-sm text-gray-700">{SIGN_IN_METHODS_COPY.noPassword}</Text>
          {email &&
            (reset.isSuccess ? (
              <Text testID="sign-in-methods-reset-sent" className="text-sm text-gray-700">
                {SIGN_IN_METHODS_COPY.sentTo} {email}. {SIGN_IN_METHODS_COPY.sentHint}
              </Text>
            ) : (
              <Button
                testID="sign-in-methods-set-password"
                variant="outline"
                loading={reset.isPending}
                onPress={() => reset.mutate({ email })}
              >
                {SIGN_IN_METHODS_COPY.setPassword}
              </Button>
            ))}
          {reset.isError && (
            <Text className="text-sm text-red-700">{userFacingErrorMessage(reset.error)}</Text>
          )}
        </View>
      )}
    </Card>
  );
}

function MethodRow({
  provider,
  connected,
  busy,
  loading,
  onConnect,
  onDisconnect,
}: {
  provider: SocialProvider;
  connected: LinkedIdentity | undefined;
  busy: boolean;
  loading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const label = SOCIAL_PROVIDER_LABELS[provider];
  const id = provider.toLowerCase();
  return (
    <View testID={`sign-in-method-${id}`} className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-medium text-gray-900">{label}</Text>
        <Text variant="muted" numberOfLines={1} className="text-xs">
          {connected
            ? (connected.email ?? SIGN_IN_METHODS_COPY.connected)
            : SIGN_IN_METHODS_COPY.notConnected}
        </Text>
      </View>
      {connected ? (
        <Button
          testID={`sign-in-method-${id}-disconnect`}
          variant="outline"
          disabled={busy}
          accessibilityLabel={`${SIGN_IN_METHODS_COPY.disconnect} ${label}`}
          onPress={onDisconnect}
        >
          {SIGN_IN_METHODS_COPY.disconnect}
        </Button>
      ) : (
        <Button
          testID={`sign-in-method-${id}-connect`}
          variant="outline"
          loading={loading}
          disabled={busy}
          accessibilityLabel={`${SIGN_IN_METHODS_COPY.connect} ${label}`}
          onPress={onConnect}
        >
          {SIGN_IN_METHODS_COPY.connect}
        </Button>
      )}
    </View>
  );
}
