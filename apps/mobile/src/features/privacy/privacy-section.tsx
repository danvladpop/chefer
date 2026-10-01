import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendsMeDto } from '@chefer/types';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { useFriendsMe } from '../friends/api/use-friends-me';
import { AccountDataCard } from '../profile/account-data-card';
import { AiConsentCard } from '../profile/ai-consent-card';
import { AnalyticsConsentCard } from '../profile/analytics-consent-card';
import { ConsentHistory } from './consent-history';
import { HealthConsentCard } from './health-consent-card';

// ─── Profile › Privacy & data (T-39.4) ─────────────────────────────────────────
// Hosts every privacy/data surface in one section: AI & your data (T-26),
// Usage analytics (T-12.3), Consent history (T-39.2), a Gym settings row
// (T-36.1 — routes here since gym has its own settings screen, not a
// Profile toggle), and Download my data / Delete account (T-39.5).
// Health information (T-26.4): consent status + Withdraw and delete, above the
// AI consent (which stays separate). Following's `Profile visibility` row sits
// between Consent history and Gym settings (only while Following is available).

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

/** `Private` / `Public` / `Off` (ux-design.md §11.3). */
export function profileVisibilityValue(me: FriendsMeDto): string {
  if (!me.activated || !me.settings) return FRIENDS_COPY.privacyRow.off;
  return me.settings.visibility === 'PUBLIC'
    ? FRIENDS_COPY.privacyRow.public
    : FRIENDS_COPY.privacyRow.private;
}

/**
 * Following (ux-design.md §2.1, §11.3): `Profile visibility` → Sharing &
 * privacy once activated, else the intro. Renders nothing unless
 * `friends.availability` says yes and `friends.me` has loaded (a failed load
 * hides the row rather than guessing a value).
 */
function ProfileVisibilityRow() {
  const { me } = useFriendsMe();
  if (!me) return null;
  const value = profileVisibilityValue(me);
  return (
    <PressableScale
      pressScale="card"
      testID="profile-friends-visibility"
      accessibilityRole="button"
      accessibilityLabel={`${FRIENDS_COPY.privacyRow.label}, ${value}`}
      onPress={() => router.push(me.activated ? '/friends/settings' : '/friends')}
      className="min-h-11 flex-row items-center gap-3 rounded-xl border border-border bg-card p-4"
    >
      <Ionicons name="people-outline" size={20} color="#944a00" />
      <Text className="min-w-0 flex-1 font-semibold text-gray-900">
        {FRIENDS_COPY.privacyRow.label}
      </Text>
      <Text testID="profile-friends-visibility-value" variant="muted" className="shrink-0">
        {value}
      </Text>
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
      <HealthConsentCard />
      <AiConsentCard />
      <AnalyticsConsentCard />
      <ConsentHistory />
      <ProfileVisibilityRow />
      <GymSettingsRow />
      {/* Destructive last (App Store 5.1.1(v)): Your data → Delete account. */}
      <AccountDataCard />
    </View>
  );
}
