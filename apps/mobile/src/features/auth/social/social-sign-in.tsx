import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { openLegal } from '../../legal/open-legal';
import { AUTH_COPY } from '../copy';
import { GoogleButton } from './google-button';
import { useSocialProviders } from './social-providers';
import { useSocialSignIn } from './use-social-sign-in';

// "Continue with Apple" / "Continue with Google" for Welcome, Sign in and
// Create account (WP-22). Renders nothing until the API says a provider is
// configured AND this binary can serve it (see social-providers.ts), so an
// unconfigured server or an old binary shows exactly the screen it had before.

/** True when at least one provider button would be shown (Welcome swaps its legal footer for ours). */
export function useHasSocialProviders(): boolean {
  const providers = useSocialProviders();
  return Boolean(providers.apple ?? providers.google);
}

/** "By continuing you agree to the Terms and Privacy Policy and confirm you are 16 or older." */
export function SocialConsentLine() {
  return (
    <Text variant="muted" testID="social-consent" className="text-center text-xs">
      {AUTH_COPY.socialConsentLead}{' '}
      <Text
        accessibilityRole="link"
        className="text-xs text-primary underline"
        onPress={() => openLegal('terms')}
      >
        Terms
      </Text>
      {' and '}
      <Text
        accessibilityRole="link"
        className="text-xs text-primary underline"
        onPress={() => openLegal('privacy')}
      >
        Privacy Policy
      </Text>{' '}
      {AUTH_COPY.socialConsentTail}
    </Text>
  );
}

export function SocialSignIn({ showDivider = true }: { showDivider?: boolean }) {
  const providers = useSocialProviders();
  const { start, error, busy } = useSocialSignIn(providers);
  const Apple = providers.apple;
  if (!Apple && !providers.google) return null;

  return (
    <View testID="social-sign-in" className="gap-3">
      {showDivider && (
        <View className="flex-row items-center gap-3" accessibilityElementsHidden>
          <View className="h-px flex-1 bg-border" />
          <Text variant="muted" className="text-xs">
            {AUTH_COPY.socialDivider}
          </Text>
          <View className="h-px flex-1 bg-border" />
        </View>
      )}

      {Apple && (
        // Apple's own button (HIG: first among the options, same size). Dims
        // and ignores touches while a sign-in is in flight.
        <View
          testID="social-apple-wrap"
          pointerEvents={busy ? 'none' : 'auto'}
          style={{ opacity: busy ? 0.5 : 1 }}
        >
          <Apple.AppleAuthenticationButton
            testID="social-apple"
            buttonType={Apple.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={Apple.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={8}
            style={{ height: 48, width: '100%' }}
            onPress={() => void start('apple')}
          />
        </View>
      )}
      {providers.google && (
        <GoogleButton
          testID="social-google"
          label={AUTH_COPY.socialGoogle}
          loading={busy === 'google'}
          disabled={busy !== null}
          onPress={() => void start('google')}
        />
      )}

      {error && (
        <Text
          testID="social-error"
          accessibilityRole="alert"
          variant="muted"
          className="text-destructive"
        >
          {error}
        </Text>
      )}
      <SocialConsentLine />
    </View>
  );
}
