import { View } from 'react-native';
import { router } from 'expo-router';
import { BOOKING_COPY } from '@chefer/types';
import { Button, Text, useThemeColors } from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useCoachingStatus } from '../use-coaching-status';

// Consent copy v2 (trainer-mode.md §10, O-7): an existing client gets a
// ONE-TIME notice, not a re-consent gate — "What's new with Ana: bookings and
// logged workouts", with Leave and Got it. Got it records the new copy
// version (`coaching.acknowledgeConsentUpdate`) and the notice is gone on
// every device. Shown on Your trainer and among the coaching notices on
// Today/Train; `coaching.status.consentUpdate` decides (absent below level 8).

/** Leave from Today/Train: Your trainer, with the Leave confirmation open. */
export const LEAVE_HREF = { pathname: '/coaching', params: { leave: '1' } } as const;

export function ConsentUpdateNotice({ onLeave }: { onLeave?: () => void }) {
  const colors = useThemeColors();
  const utils = trpc.useUtils();
  const { enabled, data } = useCoachingStatus();
  const acknowledge = trpc.coaching.acknowledgeConsentUpdate.useMutation({
    meta: { silent: true },
    onSettled: () => void utils.coaching.status.invalidate(),
  });
  const update = enabled ? (data?.consentUpdate ?? null) : null;
  if (!update || !data?.trainer) return null;
  const trainer = update.trainerName;
  return (
    <View
      testID="coaching-consent-update"
      className="min-w-0 gap-3 rounded-card bg-brand-tint px-4 py-3"
    >
      <View className="min-w-0 flex-row items-start gap-2">
        <View className="min-h-6 justify-center">
          <Icon name="yourTrainer" color={colors.brand} size={18} />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text
            testID="coaching-consent-update-title"
            className="text-subhead font-semibold text-label"
          >
            {BOOKING_COPY.notices.consentUpdate(trainer)}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {BOOKING_COPY.notices.consentUpdateBody(trainer)}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        <Button
          testID="coaching-consent-update-leave"
          variant="outline"
          className="flex-1"
          onPress={onLeave ?? (() => router.push(LEAVE_HREF))}
        >
          {BOOKING_COPY.notices.leave}
        </Button>
        <Button
          testID="coaching-consent-update-ok"
          className="flex-1"
          loading={acknowledge.isPending}
          onPress={() => {
            // Gone at once; the refetch after the call settles is the source of truth.
            utils.coaching.status.setData(undefined, (s) =>
              s ? { ...s, consentUpdate: null } : s,
            );
            acknowledge.mutate(undefined);
          }}
        >
          {BOOKING_COPY.notices.gotIt}
        </Button>
      </View>
    </View>
  );
}
