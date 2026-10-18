import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { BOOKING_COPY, type TrainerBookingDto } from '@chefer/types';
import { Badge, ErrorState, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { bookingDayTimeRange, bookingWhat, cn, deviceTimeZone, todayIn } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { trainerBookingHref } from '../../trainer-mode/open-booking';

// Client detail → Bookings (trainer-mode.md §6.5, M3): sessions delivered this
// month and last month, then upcoming and past bookings with this client and
// their attendance (cancelled ones greyed). A row opens the booking.

function attendanceOf(booking: TrainerBookingDto, clientId: string) {
  return booking.clients.find((c) => c.clientId === clientId)?.attendance ?? 'CANCELLED';
}

function attendanceBadge(attendance: string, past: boolean) {
  const d = BOOKING_COPY.detail;
  if (attendance === 'ATTENDED') return { text: d.attended, variant: 'success' as const };
  if (attendance === 'NO_SHOW') return { text: d.noShow, variant: 'warning' as const };
  if (attendance === 'CANCELLED') {
    return { text: BOOKING_COPY.schedule.cancelled, variant: 'secondary' as const };
  }
  return past ? { text: d.markAttendance, variant: 'warning' as const } : null;
}

function Row({
  booking,
  clientId,
  past,
  zone,
  today,
}: {
  booking: TrainerBookingDto;
  clientId: string;
  past: boolean;
  zone: string;
  today: string;
}) {
  const colors = useThemeColors();
  const attendance = booking.cancelledAt ? 'CANCELLED' : attendanceOf(booking, clientId);
  const badge = attendanceBadge(attendance, past);
  const when = bookingDayTimeRange(booking, zone, today);
  const what = bookingWhat(booking);
  return (
    // MO-01: press feedback on the row.
    <PressableScale
      testID={`trainer-client-booking-${booking.id}`}
      accessibilityRole="button"
      accessibilityLabel={[when, what, badge?.text].filter(Boolean).join('. ')}
      onPress={() => router.push(trainerBookingHref(booking.id))}
      className={cn(
        'min-h-14 flex-row items-center gap-2 rounded-control border border-separator px-4 py-2',
        attendance === 'CANCELLED' ? 'bg-surface-sunken' : 'bg-surface',
      )}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          className={cn(
            'text-subhead font-semibold',
            attendance === 'CANCELLED' ? 'text-label-secondary line-through' : 'text-label',
          )}
        >
          {when}
        </Text>
        {what ? <Text className="text-caption text-label-secondary">{what}</Text> : null}
      </View>
      {badge ? <Badge variant={badge.variant}>{badge.text}</Badge> : null}
      <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
    </PressableScale>
  );
}

export function BookingsTab({ clientId }: { clientId: string }) {
  const [zone] = useState(deviceTimeZone);
  const [listToday] = useState(localDate);
  const query = trpc.trainer.client.bookings.useQuery(
    { clientId, today: listToday },
    { retry: false },
  );
  const copy = BOOKING_COPY.clientDetail;
  if (query.isPending) {
    return (
      <View testID="trainer-bookings-loading" className="items-center py-10">
        <ActivityIndicator />
      </View>
    );
  }
  if (query.isError) {
    return <ErrorState testID="trainer-bookings-error" onRetry={() => void query.refetch()} />;
  }
  const d = query.data;
  const today = todayIn(zone);
  return (
    <View testID="trainer-client-bookings" className="gap-4">
      <Text testID="trainer-client-delivered" className="text-subhead text-label-secondary">
        {`${copy.deliveredThisMonth(d.deliveredThisMonth)} · ${copy.deliveredLastMonth(d.deliveredLastMonth)}`}
      </Text>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {copy.upcoming}
        </Text>
        {d.upcoming.length === 0 ? (
          <Text testID="trainer-client-bookings-none" className="text-subhead text-label-secondary">
            {BOOKING_COPY.schedule.empty}
          </Text>
        ) : (
          d.upcoming.map((b) => (
            <Row
              key={b.id}
              booking={b}
              clientId={clientId}
              past={false}
              zone={zone}
              today={today}
            />
          ))
        )}
      </View>
      {d.past.length > 0 ? (
        <View className="gap-2">
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            {copy.past}
          </Text>
          {d.past.map((b) => (
            <Row key={b.id} booking={b} clientId={clientId} past zone={zone} today={today} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
