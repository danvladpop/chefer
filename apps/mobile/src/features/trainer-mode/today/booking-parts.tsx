import { View } from 'react-native';
import { router } from 'expo-router';
import type { Translator } from '@chefer/i18n';
import {
  BOOKING_START_EARLY_MIN,
  type SessionsDeliveredDto,
  type TrainerBookingDto,
} from '@chefer/types';
import { Button, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { bookingTimeRange, bookingWhat, canStartBooking, todaysNextBooking } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useT } from '../../../lib/i18n';
import { CoachingCard } from '../../trainer/components/coaching-card';
import {
  bookingDayTimeRangeText,
  bookingWhenText,
  bookingWhoText,
} from '../bookings/booking-model';
import { coachHref, trainerBookingHref } from '../open-booking';

// Trainer Today's booking parts (trainer-mode.md §6.1, M3): the next booking
// (Start from 15 minutes before), the rest of today, past bookings waiting for
// attendance, and sessions delivered this month per client.

function bookingLine(tr: Translator, b: TrainerBookingDto, zone: string, today: string): string {
  return [bookingDayTimeRangeText(tr, b, zone, today), bookingWhoText(tr, b), bookingWhat(b)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * §6.1 (2): today's next booking with Start (from 15 minutes before); on a day
 * with none, "No bookings today", a link to the next one and Add a booking —
 * the same rule as web (`todaysNextBooking`).
 */
export function NextBookingCard({
  next,
  zone,
  today,
  now,
  onAdd,
}: {
  next: TrainerBookingDto | null;
  zone: string;
  today: string;
  now: Date;
  onAdd: () => void;
}) {
  const colors = useThemeColors();
  const tr = useT();
  const { t } = tr;
  const { today: todays, later } = todaysNextBooking(next, zone, today);
  const startable = todays !== null && canStartBooking(todays, now);
  return (
    <CoachingCard testID="trainer-today-next-booking" className="gap-3">
      <Text accessibilityRole="header" className="text-title3 font-bold text-label">
        {t('trainer.bookings.today.nextBooking')}
      </Text>
      {todays ? (
        <>
          {/* MO-01: the booking row scales on press. */}
          <PressableScale
            testID="trainer-today-next-booking-open"
            accessibilityRole="button"
            accessibilityLabel={bookingLine(tr, todays, zone, today)}
            onPress={() => router.push(trainerBookingHref(todays.id))}
            className="min-h-14 flex-row items-center gap-3 rounded-control bg-surface-sunken px-3 py-2"
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text
                testID="trainer-today-next-booking-time"
                className="text-headline font-bold text-label"
              >
                {bookingTimeRange(todays, zone)}
              </Text>
              <Text className="text-subhead font-semibold text-label" numberOfLines={2}>
                {todays.clients.map((c) => c.name).join(', ') || bookingWhoText(tr, todays)}
              </Text>
              <Text className="text-subhead text-label-secondary">
                {bookingWhat(todays) ?? t('trainer.bookings.editor.nextDay')}
              </Text>
              {todays.location ? (
                <View className="flex-row items-center gap-1">
                  <Icon name="location" color={colors.labelSecondary} size={14} />
                  <Text className="min-w-0 flex-1 text-caption text-label-secondary">
                    {todays.location}
                  </Text>
                </View>
              ) : null}
            </View>
            <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
          </PressableScale>
          <View className="gap-1">
            <Button
              testID="trainer-today-start"
              disabled={!startable}
              onPress={() => router.push(coachHref(todays.id))}
            >
              {t('trainer.bookings.detail.start')}
            </Button>
            {!startable ? (
              <Text className="text-caption text-label-secondary">
                {t('trainer.bookings.detail.startAvailable', { count: BOOKING_START_EARLY_MIN })}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <Text testID="trainer-today-no-bookings" className="text-subhead text-label-secondary">
            {t('trainer.bookings.today.noBookingsToday')}
          </Text>
          {later ? (
            <PressableScale
              testID="trainer-today-next-booking-open"
              accessibilityRole="link"
              onPress={() => router.push(trainerBookingHref(later.id))}
              className="min-h-11 flex-row items-center gap-2"
            >
              <Text className="min-w-0 flex-1 text-subhead text-label underline">
                {`${t('trainer.bookings.today.nextOn', {
                  when: bookingWhenText(tr, later.startsAt, zone),
                })} · ${bookingWhoText(tr, later)}`}
              </Text>
              <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
            </PressableScale>
          ) : null}
          <Button testID="trainer-today-add-booking" variant="outline" onPress={onAdd}>
            {t('trainer.bookings.schedule.add')}
          </Button>
        </>
      )}
    </CoachingCard>
  );
}

function BookingRow({
  booking,
  zone,
  today,
  testID,
}: {
  booking: TrainerBookingDto;
  zone: string;
  today: string;
  testID: string;
}) {
  const colors = useThemeColors();
  const tr = useT();
  const line = bookingLine(tr, booking, zone, today);
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={line}
      onPress={() => router.push(trainerBookingHref(booking.id))}
      className="min-h-12 flex-row items-center gap-2 rounded-control border border-separator bg-surface px-4 py-2"
    >
      <Text className="min-w-0 flex-1 text-subhead text-label">{line}</Text>
      <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
    </PressableScale>
  );
}

/** §6.1 (3): the rest of today. */
export function LaterToday({
  bookings,
  zone,
  today,
}: {
  bookings: readonly TrainerBookingDto[];
  zone: string;
  today: string;
}) {
  const { t } = useT();
  if (bookings.length === 0) return null;
  return (
    <View testID="trainer-today-later" className="gap-2">
      <Text accessibilityRole="header" className="text-title3 font-bold text-label">
        {t('trainer.bookings.today.todaysBookings')}
      </Text>
      {bookings.map((b) => (
        <BookingRow
          key={b.id}
          testID={`trainer-today-later-${b.id}`}
          booking={b}
          zone={zone}
          today={today}
        />
      ))}
    </View>
  );
}

/** "Mark attendance" (§6.7): past bookings with a client still unmarked; each opens its detail. */
export function UnmarkedAttendance({
  bookings,
  zone,
  today,
}: {
  bookings: readonly TrainerBookingDto[];
  zone: string;
  today: string;
}) {
  const { t } = useT();
  if (bookings.length === 0) return null;
  return (
    <View testID="trainer-today-unmarked" className="gap-2">
      <Text
        testID="trainer-today-unmarked-title"
        className="text-headline font-semibold text-label"
      >
        {t('trainer.bookings.today.unmarked', { count: bookings.length })}
      </Text>
      {bookings.map((b) => (
        <BookingRow
          key={b.id}
          testID={`trainer-today-unmarked-${b.id}`}
          booking={b}
          zone={zone}
          today={today}
        />
      ))}
    </View>
  );
}

/** §6.1 (6): "Maria · 6" per client; a row opens that client's Bookings tab. */
export function SessionsDelivered({ rows }: { rows: readonly SessionsDeliveredDto[] }) {
  const colors = useThemeColors();
  const { t } = useT();
  if (rows.length === 0) return null;
  return (
    <View testID="trainer-today-delivered" className="gap-2">
      <Text accessibilityRole="header" className="text-title3 font-bold text-label">
        {t('trainer.bookings.today.sessionsDelivered')}
      </Text>
      {rows.map((row) => (
        <PressableScale
          key={row.clientId}
          testID={`trainer-today-delivered-${row.clientId}`}
          accessibilityRole="button"
          accessibilityLabel={t('trainer.bookings.today.sessionsDeliveredRow', {
            name: row.name,
            n: row.count,
          })}
          onPress={() =>
            router.push({
              pathname: '/trainer/[clientId]',
              params: { clientId: row.clientId, tab: 'bookings' },
            })
          }
          className="min-h-12 flex-row items-center gap-2 rounded-control border border-separator bg-surface px-4 py-2"
        >
          <Text className="min-w-0 flex-1 text-subhead text-label">
            {t('trainer.bookings.today.sessionsDeliveredRow', { name: row.name, n: row.count })}
          </Text>
          <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
        </PressableScale>
      ))}
      <Text className="text-caption text-label-secondary">
        {t('trainer.bookings.today.sessionsDeliveredFooter')}
      </Text>
    </View>
  );
}
