import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HEALTH_CONSENT_COPY } from '@chefer/types';
import { Button, Text } from '@chefer/ui-mobile';

// ─── Amber notices after "Don't save it" (UX-26, T-26.2, AC2) ─────────────────
// `HealthDeclinedNotice` sits under the step/card whose health fields were
// discarded ("Without this, Chefer can't check plans for allergies."). The
// Today card (`HealthConsentNoticeCard`) is the dismissible nudge back into
// the sheet while plans are not being checked.

export function HealthDeclinedNotice({
  message = HEALTH_CONSENT_COPY.declinedNotice,
  testID = 'health-declined-notice',
}: {
  message?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      className="flex-row items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3"
    >
      <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
      <Text className="min-w-0 flex-1 text-sm text-amber-900">{message}</Text>
    </View>
  );
}

export function HealthConsentNoticeCard({
  onAllow,
  onDismiss,
}: {
  onAllow: () => void;
  onDismiss?: () => void;
}) {
  return (
    <View
      testID="health-consent-notice-card"
      className="gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <Text className="text-sm font-semibold text-amber-900">
        {HEALTH_CONSENT_COPY.todayCardTitle}
      </Text>
      <View className="flex-row gap-2">
        <Button testID="health-consent-notice-allow" size="sm" onPress={onAllow}>
          {HEALTH_CONSENT_COPY.todayCardAction}
        </Button>
        {onDismiss && (
          <Button
            testID="health-consent-notice-dismiss"
            size="sm"
            variant="ghost"
            onPress={onDismiss}
          >
            Dismiss
          </Button>
        )}
      </View>
    </View>
  );
}
