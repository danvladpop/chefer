import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Text, useThemeColors } from '@chefer/ui-mobile';
import { ONBOARDING_V4_COPY as COPY } from '@chefer/utils';
import { BiscuitStage, V4Ghost, V4Heading, V4Primary, V4Screen } from './v4-ui';

// Onboarding V4 — Welcome (board OnbV4Welcome): Biscuit waves, one line, four
// one-word capabilities, Get started.

const CAP_ICONS: ComponentProps<typeof Ionicons>['name'][] = [
  'calendar-outline',
  'cart-outline',
  'camera-outline',
  'barbell-outline',
];

export function WelcomeV4() {
  const c = useThemeColors();
  return (
    <V4Screen
      center
      testID="welcome-v4"
      footer={
        <>
          <V4Primary
            label={COPY.welcomeStart}
            onPress={() => router.push('/register')}
            testID="welcome-create-account"
          />
          <V4Ghost
            label={COPY.welcomeHaveAccount}
            onPress={() => router.push('/login')}
            testID="welcome-sign-in"
          />
        </>
      }
    >
      <BiscuitStage loop="welcome" size={230} />
      <V4Heading title={COPY.welcomeTitle} lede={COPY.welcomeLede} />
      <View className="flex-row gap-2" accessibilityRole="list">
        {COPY.welcomeCaps.map((label, i) => (
          <View key={label} className="min-w-0 flex-1 items-center gap-1.5">
            <View className="h-[52px] w-[52px] items-center justify-center rounded-card border border-separator bg-surface">
              <Ionicons name={CAP_ICONS[i] ?? 'calendar-outline'} size={26} color={c.brand} />
            </View>
            <Text className="text-subhead font-semibold text-label">{label}</Text>
          </View>
        ))}
      </View>
    </V4Screen>
  );
}
