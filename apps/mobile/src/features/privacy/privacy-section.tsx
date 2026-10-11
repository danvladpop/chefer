import { View } from 'react-native';
import { router } from 'expo-router';
import { FRIENDS_COPY, type FriendsMeDto } from '@chefer/types';
import { PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../components/icon';
import { useFriendsMe } from '../friends/api/use-friends-me';
import { AccountDataCard } from '../profile/account-data-card';
import { AiConsentCard } from '../profile/ai-consent-card';
import { AnalyticsConsentCard } from '../profile/analytics-consent-card';
import { SectionAnchor } from '../settings/section-anchor';
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
// 11 Oct restyle: rows in the shell's card look, colour roles, Icon set.

const ROW =
  'min-h-11 flex-row items-center gap-3 rounded-card border border-separator bg-surface p-4';

function GymSettingsRow() {
  const colors = useThemeColors();
  return (
    <PressableScale
      pressScale="card"
      testID="profile-gym-settings"
      accessibilityRole="button"
      accessibilityLabel="Gym settings"
      onPress={() => router.push('/gym/settings')}
      className={ROW}
    >
      <Icon name="barbell" size={22} color={colors.brand} />
      <Text className="min-w-0 flex-1 text-body text-label">Gym settings</Text>
      <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
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
  const colors = useThemeColors();
  if (!me) return null;
  const value = profileVisibilityValue(me);
  return (
    <PressableScale
      pressScale="card"
      testID="profile-friends-visibility"
      accessibilityRole="button"
      accessibilityLabel={`${FRIENDS_COPY.privacyRow.label}, ${value}`}
      onPress={() => router.push(me.activated ? '/friends/settings' : '/friends')}
      className={ROW}
    >
      <Icon name="following" size={22} color={colors.brand} />
      <Text className="min-w-0 flex-1 text-body text-label">{FRIENDS_COPY.privacyRow.label}</Text>
      <Text
        testID="profile-friends-visibility-value"
        className="shrink-0 text-body text-label-secondary"
      >
        {value}
      </Text>
      <Icon name="chevronRight" size={18} color={colors.labelTertiary} />
    </PressableScale>
  );
}

export function PrivacySection() {
  return (
    <View testID="profile-privacy-section" className="gap-4">
      {/* A dedicated testID on the (small) heading, not the whole section —
          the section is taller than one screen, so scrollUntilVisible on
          profile-privacy-section itself can never reach 100% visibility. */}
      <Text
        testID="profile-privacy-heading"
        accessibilityRole="header"
        className="text-title3 font-bold text-label"
      >
        Privacy & data
      </Text>
      <HealthConsentCard />
      <AiConsentCard />
      <AnalyticsConsentCard />
      <ConsentHistory />
      <ProfileVisibilityRow />
      <GymSettingsRow />
      {/* Destructive last (App Store 5.1.1(v)): Your data → Delete account. */}
      <SectionAnchor id="account">
        <AccountDataCard />
      </SectionAnchor>
    </View>
  );
}
