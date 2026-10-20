import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { BOOKING_COPY, type ClientBookingDto } from '@chefer/types';
import { PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  bookingDayTimeRange,
  bookingOthersText,
  clientCardText,
  cn,
  deviceTimeZone,
  nextClientCardBooking,
  todayIn,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { askBookingReminderPermissionOnce } from '../../notifications/booking-reminders';
import { clientBookingHref } from '../../trainer-mode/open-booking';
import { useCoachingStatus } from '../use-coaching-status';

// The client's upcoming bookings (trainer-mode.md §6.9): the card on Today and
// Train (the next live booking within 7 days, only the next one) and the list
// on Your trainer. Both read `coaching.bookings.upcoming` (the reminders host
// reads the same query). Self-gated: no trainer, nothing asked, nothing shown.

export function useUpcomingBookings() {
  const status = useCoachingStatus();
  const hasTrainer = status.enabled && Boolean(status.data?.trainer);
  const query = trpc.coaching.bookings.upcoming.useQuery(undefined, {
    enabled: hasTrainer,
    retry: false,
    staleTime: 60_000,
  });
  return { hasTrainer, query, bookings: hasTrainer ? (query.data ?? []) : [] };
}

/** "Session with Ana · Tue 18:00 · Gym Fit Center" → the read-only booking. */
export function UpcomingBookingCard() {
  const colors = useThemeColors();
  const { bookings } = useUpcomingBookings();
  const [zone] = useState(deviceTimeZone);
  const next = nextClientCardBooking(bookings, new Date());
  const nextId = next?.id ?? null;
  useEffect(() => {
    // §7.3: a client's first booking is the moment reminders have value.
    if (nextId) void askBookingReminderPermissionOnce('client');
  }, [nextId]);
  if (!next) return null;
  const text = clientCardText(next, zone, todayIn(zone));
  return (
    // MO-01: a card-sized tap target scales on press.
    <PressableScale
      testID="coaching-upcoming-booking"
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={() => router.push(clientBookingHref(next.id))}
      className="min-h-14 min-w-0 flex-row items-center gap-3 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-brand-tint">
        <Icon name="calendar" color={colors.brand} size={18} />
      </View>
      <Text
        testID="coaching-upcoming-booking-text"
        className="min-w-0 flex-1 text-subhead font-semibold text-label"
      >
        {text}
      </Text>
      <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
    </PressableScale>
  );
}

/** One row of the Your trainer list: "Tue 21 Oct, 18:00–19:00 · Gym Fit Center", greyed when cancelled. */
export function ClientBookingRow({ booking }: { booking: ClientBookingDto }) {
  const colors = useThemeColors();
  const [zone] = useState(deviceTimeZone);
  const cancelled = booking.cancelledAt !== null;
  const when = bookingDayTimeRange(booking, zone, todayIn(zone));
  const detail = [booking.workoutName, booking.location, bookingOthersText(booking)]
    .filter(Boolean)
    .join(' · ');
  const label = [when, cancelled ? BOOKING_COPY.client.cancelled : null, detail || null]
    .filter(Boolean)
    .join('. ');
  return (
    <PressableScale
      testID={`client-booking-${booking.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(clientBookingHref(booking.id))}
      className={cn(
        'min-h-14 min-w-0 flex-row items-center gap-2 rounded-control border border-separator bg-surface px-4 py-2',
        cancelled && 'bg-surface-sunken',
      )}
    >
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            'text-subhead font-semibold',
            cancelled ? 'text-label-secondary line-through' : 'text-label',
          )}
        >
          {when}
        </Text>
        {cancelled ? (
          <Text className="text-caption text-label-secondary">{BOOKING_COPY.client.cancelled}</Text>
        ) : null}
        {detail ? <Text className="text-caption text-label-secondary">{detail}</Text> : null}
      </View>
      <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
    </PressableScale>
  );
}

/** Your trainer → "Upcoming bookings" (read-only). */
export function UpcomingBookingsList() {
  const { hasTrainer, query, bookings } = useUpcomingBookings();
  if (!hasTrainer || query.isPending || query.isError) return null;
  return (
    <View testID="your-trainer-bookings" className="gap-2">
      <Text accessibilityRole="header" className="text-title3 font-bold text-label">
        {BOOKING_COPY.client.upcoming}
      </Text>
      {bookings.length === 0 ? (
        <Text testID="your-trainer-bookings-none" className="text-subhead text-label-secondary">
          {BOOKING_COPY.client.none}
        </Text>
      ) : (
        bookings.map((b) => <ClientBookingRow key={b.id} booking={b} />)
      )}
    </View>
  );
}
