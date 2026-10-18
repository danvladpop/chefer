import { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { BOOKING_COPY, COACHING_COPY, type ClientBookingDto } from '@chefer/types';
import { Badge, EmptyState, ErrorState, Screen, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  bookingDayTimeRange,
  bookingOthersText,
  bookingZoneHint,
  cn,
  deviceTimeZone,
  todayIn,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { useCoachingAvailability } from '../../trainer/api/use-coaching-availability';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { TrainerHeader } from '../../trainer/components/trainer-header';

// ─── The client's booking, read-only (trainer-mode.md §6.9, §10) ──────────────
// When (device zone, with the booking's own zone as a hint when it differs),
// who it is with ("with 1 other" — never another client's name), where, the
// workout and the trainer's note; a cancelled one greyed with the reason.
// Offline it falls back to the cached upcoming list.

const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];

function Row({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View testID={testID} className="gap-0.5">
      <Text className="text-caption font-semibold text-label-secondary">{label}</Text>
      <Text className="text-body text-label">{value}</Text>
    </View>
  );
}

export function ClientBookingScreen({ bookingId }: { bookingId: string }) {
  const colors = useThemeColors();
  const [zone] = useState(deviceTimeZone);
  const { enabled } = useCoachingAvailability();
  const utils = trpc.useUtils();
  const query = trpc.coaching.bookings.get.useQuery(
    { bookingId },
    {
      enabled: enabled && bookingId !== '',
      retry: false,
      placeholderData: () =>
        utils.coaching.bookings.upcoming.getData()?.find((b) => b.id === bookingId),
    },
  );
  const header = (
    <TrainerHeader testID="client-booking-header" title={BOOKING_COPY.client.detailTitle} />
  );

  if (query.isPending) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0" testID="client-booking-loading">
        {header}
        <View className="items-center py-16">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }
  if (!query.data) {
    const missing = query.error.data?.code === 'NOT_FOUND';
    return (
      <Screen edges={EDGES} className="bg-canvas px-0">
        {header}
        {missing ? (
          <EmptyState
            testID="client-booking-missing"
            icon={<Icon name="calendar" color={colors.labelTertiary} size={40} />}
            title={BOOKING_COPY.server.notFound}
          />
        ) : (
          <ErrorState testID="client-booking-error" onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }

  const b: ClientBookingDto = query.data;
  const cancelled = b.cancelledAt !== null;
  const hint = bookingZoneHint(b, zone);
  return (
    <Screen edges={EDGES} className="bg-canvas px-0" testID="client-booking">
      {header}
      <ScrollView contentContainerClassName="gap-4 px-4 pb-8 pt-2">
        <CoachingCard className="gap-4">
          <View className="gap-1">
            <Text
              testID="client-booking-when"
              className={cn(
                'text-title3 font-bold',
                cancelled ? 'text-label-secondary line-through' : 'text-label',
              )}
            >
              {bookingDayTimeRange(b, zone, todayIn(zone))}
            </Text>
            {hint ? (
              <Text testID="client-booking-zone" className="text-caption text-label-secondary">
                {hint}
              </Text>
            ) : null}
            {cancelled ? (
              <View className="flex-row">
                <Badge testID="client-booking-cancelled" variant="warning">
                  {BOOKING_COPY.client.cancelled}
                </Badge>
              </View>
            ) : null}
            {cancelled && b.cancelReason ? (
              <Text className="text-subhead text-label-secondary">{b.cancelReason}</Text>
            ) : null}
          </View>
          <Row
            testID="client-booking-trainer"
            label={COACHING_COPY.yourTrainer.title}
            value={[b.trainer.name, bookingOthersText(b)].filter(Boolean).join(', ')}
          />
          {b.workoutName ? (
            <Row
              testID="client-booking-workout"
              label={BOOKING_COPY.editor.workout}
              value={b.workoutName}
            />
          ) : null}
          {b.location ? (
            <Row
              testID="client-booking-location"
              label={BOOKING_COPY.editor.location}
              value={b.location}
            />
          ) : null}
          {b.note ? (
            <Row testID="client-booking-note" label={BOOKING_COPY.editor.note} value={b.note} />
          ) : null}
        </CoachingCard>
      </ScrollView>
    </Screen>
  );
}
