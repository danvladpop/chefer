import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  BOOKING_COPY,
  BOOKING_START_EARLY_MIN,
  type BookingAttendance,
  type BookingScope,
  type TrainerBookingClientDto,
  type TrainerBookingDto,
} from '@chefer/types';
import {
  Badge,
  Button,
  Chip,
  DONE_FIELD_PROPS,
  EmptyState,
  ErrorState,
  Input,
  keyboardDismissMode,
  Screen,
  SegmentedControl,
  Sheet,
  Text,
  useSnackbar,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  bookingDayTimeRange,
  bookingHasStart,
  bookingWho,
  bookingZoneHint,
  canChangeBooking,
  canMarkAttendance,
  canStartBooking,
  deviceTimeZone,
  nextAttendance,
  todayIn,
  userFacingErrorMessage,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { useCoachPrefetch } from '../../trainer-coach/coach-prefetch';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { TrainerHeader } from '../../trainer/components/trainer-header';
import { coachHref } from '../open-booking';
import { useBookingEditor } from './booking-editor';
import { useInvalidateBookings } from './use-bookings';

// ─── One booking, the trainer's view (trainer-mode.md §6.2–§6.4, §6.7) ────────
// When (device zone, plus the booking's own zone when it differs), the
// clients with Attended / No-show each (`markAttendance`; tapping the marked
// one again clears it), their workout and "Logged by you" once a coached
// workout exists, the location and the note. Start opens the coached logger
// from 15 minutes before; Edit opens the editor; Cancel booking asks for the
// scope of a repeat and an optional reason the clients see.

const EDGES: ('top' | 'bottom' | 'left' | 'right')[] = ['top', 'bottom', 'left', 'right'];
const COPY = BOOKING_COPY.detail;

function attendanceText(a: BookingAttendance): string {
  if (a === 'ATTENDED') return COPY.attended;
  if (a === 'NO_SHOW') return COPY.noShow;
  if (a === 'CANCELLED') return BOOKING_COPY.schedule.cancelled;
  return COPY.scheduled;
}

function ClientAttendanceRow({
  booking,
  client,
  markable,
}: {
  booking: TrainerBookingDto;
  client: TrainerBookingClientDto;
  /** From 15 minutes before the start, as the API allows (`canMarkAttendance`). */
  markable: boolean;
}) {
  const utils = trpc.useUtils();
  const invalidate = useInvalidateBookings();
  const mark = trpc.trainer.bookings.markAttendance.useMutation({
    meta: { silent: true },
    onSuccess: (saved) => {
      utils.trainer.bookings.get.setData({ bookingId: saved.id }, saved);
      void invalidate();
    },
  });
  const set = (next: 'ATTENDED' | 'NO_SHOW') => {
    // Tapping the marked state again clears it.
    const attendance = nextAttendance(client.attendance, next);
    if (attendance !== 'SCHEDULED') track('attendance_marked', { status: attendance });
    mark.mutate({ bookingId: booking.id, clientId: client.clientId, attendance });
  };
  const cancelled = client.attendance === 'CANCELLED';
  return (
    <View
      testID={`booking-client-${client.clientId}`}
      className="gap-2 border-t border-separator pt-3"
    >
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-headline font-semibold text-label" numberOfLines={1}>
            {client.name}
          </Text>
          {client.workout.name ? (
            <Text className="text-subhead text-label-secondary">{client.workout.name}</Text>
          ) : client.workout.kind === 'NEXT_DAY' ? (
            <Text className="text-subhead text-label-secondary">{BOOKING_COPY.editor.nextDay}</Text>
          ) : null}
          {client.workoutSessionId ? (
            <Text
              testID={`booking-client-${client.clientId}-logged`}
              className="text-caption font-semibold text-positive"
            >
              {COPY.loggedByYou}
            </Text>
          ) : null}
        </View>
        {cancelled ? <Badge variant="secondary">{attendanceText('CANCELLED')}</Badge> : null}
      </View>
      {cancelled || !markable ? null : (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={`${COPY.attendance}, ${client.name}: ${attendanceText(client.attendance)}`}
          className="flex-row gap-2"
        >
          <Chip
            testID={`booking-client-${client.clientId}-attended`}
            label={COPY.attended}
            selected={client.attendance === 'ATTENDED'}
            disabled={mark.isPending}
            onPress={() => set('ATTENDED')}
          />
          <Chip
            testID={`booking-client-${client.clientId}-no-show`}
            label={COPY.noShow}
            selected={client.attendance === 'NO_SHOW'}
            disabled={mark.isPending}
            onPress={() => set('NO_SHOW')}
          />
        </View>
      )}
      {mark.error ? (
        <Text className="text-subhead text-danger">{userFacingErrorMessage(mark.error)}</Text>
      ) : null}
    </View>
  );
}

function CancelSheet({
  booking,
  visible,
  onClose,
}: {
  booking: TrainerBookingDto;
  visible: boolean;
  onClose: () => void;
}) {
  const snackbar = useSnackbar();
  const online = useIsOnline();
  const invalidate = useInvalidateBookings();
  const [scope, setScope] = useState<BookingScope>('THIS');
  const [reason, setReason] = useState('');
  const cancel = trpc.trainer.bookings.cancel.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      track('booking_cancelled', { scope });
      void invalidate();
      snackbar.show({ message: BOOKING_COPY.schedule.cancelled });
      onClose();
    },
  });
  return (
    <Sheet
      testID="booking-cancel"
      visible={visible}
      onClose={onClose}
      title={COPY.cancelTitle}
      footer={
        <View className="gap-2">
          <Button
            testID="booking-cancel-confirm"
            variant="destructive"
            loading={cancel.isPending}
            disabled={!online}
            onPress={() =>
              cancel.mutate({
                bookingId: booking.id,
                scope,
                reason: reason.trim() === '' ? null : reason.trim(),
              })
            }
          >
            {COPY.cancelConfirm}
          </Button>
          <Button testID="booking-cancel-keep" variant="outline" onPress={onClose}>
            {COPY.keep}
          </Button>
        </View>
      }
    >
      <View className="gap-4">
        {booking.seriesId ? (
          <SegmentedControl<BookingScope>
            testID="booking-cancel-scope"
            accessibilityLabel={BOOKING_COPY.editor.scopeTitle}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'THIS', label: BOOKING_COPY.editor.thisOnly, testID: 'booking-cancel-this' },
              {
                value: 'FOLLOWING',
                label: BOOKING_COPY.editor.following,
                testID: 'booking-cancel-following',
              },
            ]}
          />
        ) : null}
        {booking.kind === 'BOOKING' ? (
          <Input
            testID="booking-cancel-reason"
            label={COPY.cancelReason}
            maxLength={200}
            value={reason}
            onChangeText={setReason}
            {...DONE_FIELD_PROPS}
          />
        ) : null}
        {!online ? (
          <Text className="text-subhead text-attention">{BOOKING_COPY.schedule.offline}</Text>
        ) : null}
        {cancel.error ? (
          <Text testID="booking-cancel-error" className="text-subhead text-danger">
            {userFacingErrorMessage(cancel.error)}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

export function BookingDetailScreen({ bookingId }: { bookingId: string }) {
  const colors = useThemeColors();
  const snackbar = useSnackbar();
  const online = useIsOnline();
  const [zone] = useState(deviceTimeZone);
  const [now, setNow] = useState(() => new Date());
  const [cancelOpen, setCancelOpen] = useState(false);
  const query = trpc.trainer.bookings.get.useQuery(
    { bookingId },
    { enabled: bookingId !== '', retry: false },
  );
  // The coached logger (§6.7, §12): keep this booking's prescriptions so Start works offline.
  useCoachPrefetch(query.data ? [query.data] : null);
  const editor = useBookingEditor();
  // Start opens 15 minutes before: re-check every 30 s while the screen is open.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const header = <TrainerHeader testID="booking-detail-header" title={COPY.title} />;

  if (query.isPending) {
    return (
      <Screen edges={EDGES} className="bg-canvas px-0" testID="booking-detail-loading">
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
            testID="booking-detail-missing"
            icon={<Icon name="calendar" color={colors.labelTertiary} size={40} />}
            title={BOOKING_COPY.server.notFound}
          />
        ) : (
          <ErrorState testID="booking-detail-error" onRetry={() => void query.refetch()} />
        )}
      </Screen>
    );
  }

  const b = query.data;
  const cancelled = b.cancelledAt !== null;
  const hint = bookingZoneHint(b, zone);
  const startable = canStartBooking(b, now);
  const needsConnection = () => {
    snackbar.show({ message: BOOKING_COPY.schedule.offline });
  };

  return (
    <Screen edges={EDGES} className="bg-canvas px-0" testID="booking-detail">
      {header}
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={keyboardDismissMode()}
      >
        <CoachingCard className="gap-3">
          <Text
            testID="booking-detail-when"
            className={
              cancelled
                ? 'text-title3 font-bold text-label-secondary line-through'
                : 'text-title3 font-bold text-label'
            }
          >
            {bookingDayTimeRange(b, zone, todayIn(zone))}
          </Text>
          {hint ? (
            <Text testID="booking-detail-zone" className="text-caption text-label-secondary">
              {hint}
            </Text>
          ) : null}
          <Text testID="booking-detail-who" className="text-headline font-semibold text-label">
            {bookingWho(b)}
          </Text>
          {cancelled ? (
            <View className="gap-1">
              <View className="flex-row">
                <Badge testID="booking-detail-cancelled" variant="warning">
                  {BOOKING_COPY.schedule.cancelled}
                </Badge>
              </View>
              {b.cancelReason ? (
                <Text className="text-subhead text-label-secondary">{b.cancelReason}</Text>
              ) : null}
            </View>
          ) : null}
          {b.location ? (
            <View className="flex-row items-center gap-2">
              <Icon name="location" color={colors.labelSecondary} size={16} />
              <Text
                testID="booking-detail-location"
                className="min-w-0 flex-1 text-subhead text-label"
              >
                {b.location}
              </Text>
            </View>
          ) : null}
          {b.note ? (
            <View className="gap-0.5">
              <Text className="text-caption font-semibold text-label-secondary">
                {BOOKING_COPY.editor.note}
              </Text>
              <Text testID="booking-detail-note" className="text-subhead text-label">
                {b.note}
              </Text>
            </View>
          ) : null}
          {bookingHasStart(b) ? (
            <View className="gap-1">
              <Button
                testID="booking-detail-start"
                disabled={!startable}
                onPress={() => router.push(coachHref(b.id))}
              >
                {COPY.start}
              </Button>
              {!startable ? (
                <Text
                  testID="booking-detail-start-hint"
                  className="text-caption text-label-secondary"
                >
                  {COPY.startAvailable(BOOKING_START_EARLY_MIN)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </CoachingCard>

        {b.kind === 'BOOKING' && b.clients.length > 0 ? (
          <CoachingCard testID="booking-detail-clients" className="gap-3">
            <Text accessibilityRole="header" className="text-headline font-semibold text-label">
              {COPY.attendance}
            </Text>
            {b.clients.map((client) => (
              <ClientAttendanceRow
                key={client.clientId}
                booking={b}
                client={client}
                markable={canMarkAttendance(b, now)}
              />
            ))}
          </CoachingCard>
        ) : null}

        {/* Edit, move and cancel only before the start: the API refuses after. */}
        {canChangeBooking(b, now) ? (
          <View className="gap-2">
            <Button
              testID="booking-detail-edit"
              variant="outline"
              onPress={() =>
                online ? editor.open({ kind: 'edit', booking: b }) : needsConnection()
              }
            >
              {COPY.edit}
            </Button>
            <Button
              testID="booking-detail-cancel"
              variant="outline"
              onPress={() => (online ? setCancelOpen(true) : needsConnection())}
            >
              {COPY.cancel}
            </Button>
          </View>
        ) : null}
      </ScrollView>
      {editor.sheet}
      <CancelSheet booking={b} visible={cancelOpen} onClose={() => setCancelOpen(false)} />
    </Screen>
  );
}
