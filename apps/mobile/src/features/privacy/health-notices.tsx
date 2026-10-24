import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text, useThemeColors } from '@chefer/ui-mobile';
import { useT } from '../../lib/i18n';
import { HEALTH_DECLINED_BODY_NOTICE } from './copy';

// ─── Amber notices after "Don't save it" (UX-26, T-26.2, AC2) ─────────────────
// `HealthDeclinedNotice` sits under the step/card whose health fields were
// discarded ("Without this, Chefer can't check plans for allergies."). The
// Today card (`HealthConsentNoticeCard`) is the dismissible nudge back into
// the sheet while plans are not being checked.

export function HealthDeclinedNotice({
  message,
  testID = 'health-declined-notice',
}: {
  message?: string;
  testID?: string;
}) {
  const colors = useThemeColors();
  const { t } = useT();
  // The body notice is still passed in as an English constant by the screens
  // that show it; it is recognised here and shown from the catalog.
  const text =
    message === undefined
      ? t('consent.health.declinedNotice')
      : message === HEALTH_DECLINED_BODY_NOTICE
        ? t('consent.health.declinedBody')
        : message;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      className="flex-row items-start gap-2 rounded-lg border border-attention/30 bg-attention/10 p-3"
    >
      <Ionicons name="alert-circle-outline" size={18} color={colors.attention} />
      <Text className="min-w-0 flex-1 text-sm text-attention">{text}</Text>
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
  const { t } = useT();
  return (
    <View
      testID="health-consent-notice-card"
      className="gap-2 rounded-xl border border-attention/30 bg-attention/10 p-4"
    >
      <Text className="text-sm font-semibold text-attention">
        {t('consent.health.todayCardTitle')}
      </Text>
      <View className="flex-row gap-2">
        <Button testID="health-consent-notice-allow" size="sm" onPress={onAllow}>
          {t('consent.health.todayCardAction')}
        </Button>
        {onDismiss && (
          <Button
            testID="health-consent-notice-dismiss"
            size="sm"
            variant="ghost"
            onPress={onDismiss}
          >
            {t('consent.health.dismiss')}
          </Button>
        )}
      </View>
    </View>
  );
}
