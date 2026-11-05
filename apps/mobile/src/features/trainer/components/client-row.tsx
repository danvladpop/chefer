import { View } from 'react-native';
import { router } from 'expo-router';
import type { Translator } from '@chefer/i18n';
import type { ClientRowDto } from '@chefer/types';
import { Badge, PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  clientRowNextBooking,
  deviceTimeZone,
  isQuietClient,
  quietDaysOf,
  todayIn,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { getTranslator, useT } from '../../../lib/i18n';
import { formatShortDayT } from '../../coaching/copy';
import { firstNameOf, formatWeekdayDate } from '../format';

// One active client on a card (spec §2.4): name, label, last workout, this week's sessions against the
// goal, a quiet flag after 7 days without a workout, the "Keep it simple" badge and "Routine changed by…".
// Tap → the client. Shared by Trainer tools (/trainer) and trainer mode's Clients tab.
// Trainer mode M3 (§6.4): "Next booking: Tue 21 Oct, 18:00" when one is set (`nextBookingAt`, additive).

/** "Next booking: Tue 21 Oct, 18:00" in the device zone (§6.4), or null. */
function nextBookingLine(row: ClientRowDto): string | null {
  const zone = deviceTimeZone();
  return clientRowNextBooking(row, zone, todayIn(zone));
}

export function clientRowLabel(row: ClientRowDto, t: Translator['t'] = getTranslator().t): string {
  const parts = [
    row.name,
    row.lastWorkoutDate
      ? t('coaching.trainer.lastWorkout', { date: formatWeekdayDate(row.lastWorkoutDate, t) })
      : t('coaching.trainer.noWorkoutYet'),
    t('coaching.trainer.weekProgress', { sessions: row.week.sessions, goal: row.week.goal }),
  ];
  if (isQuietClient(row)) {
    parts.push(t('coaching.trainer.quiet', { count: quietDaysOf(row) }));
  }
  if (row.keepItSimple) parts.push(t('coaching.trainer.profile.keepItSimple'));
  const next = nextBookingLine(row);
  if (next) parts.push(next);
  return parts.join('. ');
}

export function ClientRow({ row }: { row: ClientRowDto }) {
  const { t } = useT();
  const colors = useThemeColors();
  // Lane K4: the server's verdict by the trainer's own threshold (food included while shared).
  const quiet = isQuietClient(row);
  return (
    // MO-01: a card-sized tap target scales on press.
    <PressableScale
      testID={`trainer-client-${row.clientId}`}
      accessibilityRole="button"
      accessibilityLabel={clientRowLabel(row, t)}
      onPress={() => router.push(`/trainer/${row.clientId}`)}
      className="min-h-14 gap-1 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-headline font-semibold text-label" numberOfLines={1}>
          {row.name}
        </Text>
        <Text className="text-subhead text-label-secondary">
          {t('coaching.trainer.weekProgress', {
            sessions: row.week.sessions,
            goal: row.week.goal,
          })}
        </Text>
        <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
      </View>
      {row.label ? (
        <Text className="min-w-0 text-caption text-label-secondary" numberOfLines={1}>
          {row.label}
        </Text>
      ) : null}
      <Text className="min-w-0 text-subhead text-label-secondary">
        {row.lastWorkoutDate
          ? t('coaching.trainer.lastWorkout', {
              date: formatWeekdayDate(row.lastWorkoutDate, t),
            })
          : t('coaching.trainer.noWorkoutYet')}
      </Text>
      {row.nextBookingAt ? (
        <Text
          testID={`trainer-client-${row.clientId}-next-booking`}
          className="min-w-0 text-subhead text-label-secondary"
        >
          {nextBookingLine(row)}
        </Text>
      ) : null}
      {quiet || row.keepItSimple ? (
        <View className="flex-row flex-wrap gap-1.5">
          {quiet ? (
            <Badge testID={`trainer-client-${row.clientId}-quiet`} variant="warning">
              {t('coaching.trainer.quiet', { count: quietDaysOf(row) })}
            </Badge>
          ) : null}
          {row.keepItSimple ? (
            <Badge testID={`trainer-client-${row.clientId}-keep-it-simple`} variant="secondary">
              {t('coaching.trainer.profile.keepItSimple')}
            </Badge>
          ) : null}
        </View>
      ) : null}
      {row.routineChangedByClientAt ? (
        <Text
          testID={`trainer-client-${row.clientId}-changed`}
          className="min-w-0 text-caption text-label-secondary"
        >
          {t('coaching.trainer.routineChangedByClient', {
            name: firstNameOf(row.name),
            date: formatShortDayT(row.routineChangedByClientAt, t),
          })}
        </Text>
      ) : null}
    </PressableScale>
  );
}
