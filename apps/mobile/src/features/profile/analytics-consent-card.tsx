import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Card, Text } from '@chefer/ui-mobile';
import {
  getAnalyticsConsent,
  isTransportEnabled,
  setAnalyticsConsent,
  track,
} from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { openLegal } from '../legal/open-legal';

// ─── Usage analytics (T-12.3, §5.10) ───────────────────────────────────────────
// Two switches, matching web's AnalyticsConsentCard: "Send anonymous usage
// counts" (Q-8 default: on) and "Link usage to my account" (default off,
// disabled while anonymous is off — linking is a superset of anonymous).
// The choice lives on this device (src/lib/analytics.ts); every change is
// also logged server-side via privacy.recordAnalyticsConsent (T-39.2) so the
// choice is provable, and fires analytics_consent_changed on the transport
// itself (best-effort — a value the user just turned off may not go out).
//
// App Review R-08: the card renders ONLY when the transport is enabled (a
// PostHog key + host are configured). Without one nothing is ever sent, so a
// switch that says "on" would contradict the App Privacy label ("no usage
// data"). The production App Store build ships without a key.

const TRACK = { true: '#944a00', false: '#d1d5db' };

export function AnalyticsConsentCard() {
  if (!isTransportEnabled()) return null;
  return <AnalyticsConsentSwitches />;
}

function AnalyticsConsentSwitches() {
  const [consent, setConsent] = useState(getAnalyticsConsent);
  const recordConsent = trpc.privacy.recordAnalyticsConsent.useMutation();

  const onAnonymousChange = (next: boolean) => {
    const updated = setAnalyticsConsent({ anonymous: next });
    setConsent(updated);
    track('analytics_consent_changed', { anonymous: updated.anonymous, linked: updated.linked });
    recordConsent.mutate(next ? { anonymous: true } : { anonymous: false, linked: false });
  };

  const onLinkedChange = (next: boolean) => {
    const updated = setAnalyticsConsent({ linked: next });
    setConsent(updated);
    track('analytics_consent_changed', { anonymous: updated.anonymous, linked: updated.linked });
    recordConsent.mutate({ linked: next });
  };

  return (
    <Card testID="profile-analytics-consent" className="gap-3">
      <Text variant="heading">Usage analytics</Text>

      <View className="min-h-11 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-gray-900">Send anonymous usage counts</Text>
          <Text variant="muted" className="text-xs">
            Which screens and buttons get used, with no name, email or health information, and
            nothing that identifies you.
          </Text>
        </View>
        <Switch
          testID="profile-analytics-anonymous-switch"
          accessibilityLabel="Send anonymous usage counts"
          value={consent.anonymous}
          onValueChange={onAnonymousChange}
          trackColor={TRACK}
        />
      </View>

      <View className="min-h-11 flex-row items-center justify-between gap-3 border-t border-border pt-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-gray-900">Link usage to my account</Text>
          <Text variant="muted" className="text-xs">
            {consent.linked
              ? 'On: we see which features you use, tied to your account ID (never your name or email), to improve Chefer.'
              : 'Off: nothing is tied to you.'}
          </Text>
        </View>
        <Switch
          testID="profile-analytics-linked-switch"
          accessibilityLabel="Link usage to my account"
          value={consent.linked}
          disabled={!consent.anonymous}
          onValueChange={onLinkedChange}
          trackColor={TRACK}
        />
      </View>

      <View className="flex-row items-center justify-between gap-2">
        <Text variant="muted" className="text-xs">
          Applies to this phone.
        </Text>
        <Button variant="ghost" size="sm" onPress={() => openLegal('privacy', 'analytics')}>
          Privacy policy
        </Button>
      </View>
    </Card>
  );
}
