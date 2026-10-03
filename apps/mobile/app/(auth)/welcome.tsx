import { Image, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, colors, Screen, Text } from '@chefer/ui-mobile';
import { AUTH_COPY } from '../../src/features/auth/copy';
import { openLegal } from '../../src/features/legal/open-legal';

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
  copyKey: 'welcomeFeatureWorkouts' | 'welcomeFeatureMeals' | 'welcomeFeatureSafety';
}

const FEATURES: FeatureRow[] = [
  { icon: 'barbell-outline', copyKey: 'welcomeFeatureWorkouts' },
  { icon: 'calendar-outline', copyKey: 'welcomeFeatureMeals' },
  { icon: 'shield-checkmark-outline', copyKey: 'welcomeFeatureSafety' },
];

export default function WelcomeScreen() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="justify-between gap-6 py-6">
      <View className="flex-1 items-center justify-center gap-6">
        <Image
          // Metro's static-asset require, not a CommonJS module import — the
          // codebase has no `*.png` ambient module declaration for an ESM
          // `import`, and this is the standard RN/Expo pattern for images.
          // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro static asset
          source={require('../../assets/icon.png') as number}
          accessibilityLabel="Chefer"
          className="h-16 w-16 rounded-2xl"
          style={{ height: 64, width: 64, borderRadius: 16 }}
        />

        <View className="items-center gap-2 px-2">
          <Text testID="welcome-title" variant="title" className="text-center">
            {AUTH_COPY.welcomeTitle}
          </Text>
          <Text variant="muted" className="text-center">
            {AUTH_COPY.welcomeSubtitle}
          </Text>
        </View>

        <View className="w-full gap-3">
          {FEATURES.map((row) => (
            <View key={row.copyKey} className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                <Ionicons name={row.icon} size={18} color={colors.primary} />
              </View>
              <Text className="min-w-0 flex-1 text-sm text-gray-700">{AUTH_COPY[row.copyKey]}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Button testID="welcome-create-account" onPress={() => router.push('/register')}>
          {AUTH_COPY.welcomeCreateAccount}
        </Button>
        <Button testID="welcome-sign-in" variant="outline" onPress={() => router.push('/login')}>
          {AUTH_COPY.welcomeHaveAccount}
        </Button>

        <Text variant="muted" className="text-center text-xs">
          {AUTH_COPY.welcomeLegalFooter}{' '}
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
          </Text>
          .
        </Text>
      </View>
    </Screen>
  );
}
