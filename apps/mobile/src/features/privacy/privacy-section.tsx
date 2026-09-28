import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { AccountDataCard } from '../profile/account-data-card';
import { AiConsentCard } from '../profile/ai-consent-card';
import { AnalyticsConsentCard } from '../profile/analytics-consent-card';
import { ConsentHistory } from './consent-history';

// ─── Profile › Privacy & data (T-39.4) ─────────────────────────────────────────
// Hosts every privacy/data surface in one section: AI & your data (T-26),
// Usage analytics (T-12.3), Consent history (T-39.2), a Gym settings row
// (T-36.1 — routes here since gym has its own settings screen, not a
// Profile toggle), and Download my data / Delete account (T-39.5).
// L-CONSENT adds health-consent rows here in wave 3.

function GymSettingsRow() {
  return (
    <PressableScale
      pressScale="card"
      testID="profile-gym-settings"
      accessibilityRole="button"
      accessibilityLabel="Gym settings"
      onPress={() => router.push('/gym/settings')}
      className="min-h-11 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
    >
      <Ionicons name="barbell-outline" size={20} color="#944a00" />
      <Text className="min-w-0 flex-1 font-semibold text-gray-900">Gym settings</Text>
      <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
    </PressableScale>
  );
}

export function PrivacySection() {
  return (
    <View testID="profile-privacy-section" className="gap-4">
      {/* A dedicated testID on the (small) heading, not the whole section —
          the section is taller than one screen, so scrollUntilVisible on
          profile-privacy-section itself can never reach 100% visibility. */}
      <Text testID="profile-privacy-heading" variant="title" className="text-lg">
        Privacy & data
      </Text>
      <AiConsentCard />
      <AnalyticsConsentCard />
      <ConsentHistory />
      <GymSettingsRow />
      {/* Destructive last (App Store 5.1.1(v)): Your data → Delete account. */}
      <AccountDataCard />
    </View>
  );
}
