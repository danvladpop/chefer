import { Image, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, colors, Screen, Text } from '@chefer/ui-mobile';
import { SocialSignIn, useHasSocialProviders } from '../../src/features/auth/social/social-sign-in';
import { openLegal } from '../../src/features/legal/open-legal';
import { useOnboardingV4Flag } from '../../src/features/onboarding-v4/use-onboarding-v4-flag';
import { WelcomeV4 } from '../../src/features/onboarding-v4/welcome-v4';
import { useT } from '../../src/lib/i18n';
import { rich } from '../../src/lib/i18n/rich';

// UX-25 (T-25.1): the first screen a fresh install ever sees (CI-09 — a
// device that has never signed in landed on "Welcome back / Sign in" with no
// logo or value statement). `(auth)/index.tsx` routes here only when
// `hasSignedInBefore` is false; everyone else goes straight to /login.
//
// Row 3 (the safety bullet) ships because UX-01/UX-02 (allergy taxonomy +
// recogniser) are already live (see Settings → "Allergies & diets"). Row 2 is
// deliberately the base copy — "the first screen only claims what works on
// the free tier" (03 §UX-25) — bump it to the training-day/time-budget
// variants in the same PR as UX-06/UX-07, not before.

interface FeatureRow {
  icon: keyof typeof Ionicons.glyphMap;
  copyKey:
    | 'auth.welcome.featureWorkouts'
    | 'auth.welcome.featureMeals'
    | 'auth.welcome.featureSafety';
}

const FEATURES: FeatureRow[] = [
  { icon: 'barbell-outline', copyKey: 'auth.welcome.featureWorkouts' },
  { icon: 'calendar-outline', copyKey: 'auth.welcome.featureMeals' },
  { icon: 'shield-checkmark-outline', copyKey: 'auth.welcome.featureSafety' },
];

function WelcomeScreenV3() {
  const { t } = useT();
  // WP-22: with Apple/Google buttons on screen, their consent line (which also
  // covers the 16+ confirmation) replaces the plain legal footer.
  const hasSocial = useHasSocialProviders();
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="justify-between gap-6 py-6">
      {/* WP-22: the Apple/Google buttons grew the bottom block, so on a small
          phone the pitch scrolls instead of being squeezed. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex-grow items-center justify-center gap-6"
        showsVerticalScrollIndicator={false}
      >
        <Image
          // Metro's static-asset require, not a CommonJS module import — the
          // codebase has no `*.png` ambient module declaration for an ESM
          // `import`, and this is the standard RN/Expo pattern for images.
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro static asset
          source={require('../../assets/icon.png') as number}
          accessibilityLabel={t('common.appName')}
          className="h-16 w-16 rounded-2xl"
          style={{ height: 64, width: 64, borderRadius: 16 }}
        />

        <View className="items-center gap-2 px-2">
          <Text testID="welcome-title" variant="title" className="text-center">
            {t('auth.welcome.title')}
          </Text>
          <Text variant="muted" className="text-center">
            {t('auth.welcome.subtitle')}
          </Text>
        </View>

        <View className="w-full gap-3">
          {FEATURES.map((row) => (
            <View key={row.copyKey} className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                <Ionicons name={row.icon} size={18} color={colors.primary} />
              </View>
              <Text className="min-w-0 flex-1 text-sm text-gray-700">{t(row.copyKey)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="gap-3">
        <Button testID="welcome-create-account" onPress={() => router.push('/register')}>
          {t('auth.welcome.createAccount')}
        </Button>
        <Button testID="welcome-sign-in" variant="outline" onPress={() => router.push('/login')}>
          {t('auth.welcome.haveAccount')}
        </Button>

        <SocialSignIn />

        {!hasSocial && (
          <Text variant="muted" className="text-center text-xs">
            {rich(t, 'auth.welcome.legalFooter', {
              terms: (
                <Text
                  accessibilityRole="link"
                  className="text-xs text-primary underline"
                  onPress={() => openLegal('terms')}
                >
                  {t('auth.links.terms')}
                </Text>
              ),
              privacy: (
                <Text
                  accessibilityRole="link"
                  className="text-xs text-primary underline"
                  onPress={() => openLegal('privacy')}
                >
                  {t('auth.links.privacy')}
                </Text>
              ),
            })}
          </Text>
        )}
      </View>
    </Screen>
  );
}

// Onboarding V4 (flag `onboardingV4`): wait for the flag rather than flash today's screen.
export default function WelcomeScreen() {
  const v4 = useOnboardingV4Flag();
  if (v4 === 'loading') return <View className="flex-1 bg-canvas" />;
  return v4 === 'on' ? <WelcomeV4 /> : <WelcomeScreenV3 />;
}
