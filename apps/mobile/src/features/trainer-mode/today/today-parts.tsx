import { View } from 'react-native';
import { router } from 'expo-router';
import {
  COACHING_LIMITS,
  QUIET_COPY,
  TRAINER_MODE_COPY,
  type TrainerQuietClientDto,
} from '@chefer/types';
import {
  Badge,
  Button,
  CountUp,
  PressableScale,
  ProgressRing,
  StatTile,
  StatTiles,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { Icon } from '../../../components/icon';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { formatWeekdayDate } from '../../trainer/format';

// Trainer Today's cards (trainer-mode.md §6.1, M1): the requests card, the
// "This week" stat row and the quiet-client rows of "Needs attention".

const COPY = TRAINER_MODE_COPY.today;

/** §6.1 (1): only while requests wait — the M1 answer to "requests are buried". */
export function RequestsCard({ count }: { count: number }) {
  const colors = useThemeColors();
  return (
    <CoachingCard testID="trainer-today-requests-card" className="gap-3">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-brand-tint">
          <Icon name="requests" color={colors.brand} />
        </View>
        <Text
          testID="trainer-today-requests-text"
          className="min-w-0 flex-1 text-headline font-semibold text-label"
        >
          {COPY.requestsCard(count)}
        </Text>
      </View>
      <Button
        testID="trainer-today-review"
        accessibilityLabel={`${COPY.review}: ${COPY.requestsCard(count)}`}
        onPress={() => router.navigate('/(trainer)/clients')}
      >
        {COPY.review}
      </Button>
    </CoachingCard>
  );
}

/** 0–1 → "67 %"-style whole percent, for the ring's centre and its spoken label. */
export function adherencePercent(adherence: number): number {
  return Math.round(Math.min(1, Math.max(0, adherence)) * 100);
}

function AdherenceTile({ adherence }: { adherence: number | null }) {
  const colors = useThemeColors();
  const percent = adherence === null ? null : adherencePercent(adherence);
  return (
    <View
      testID="trainer-today-stat-adherence"
      accessible
      accessibilityLabel={`${COPY.adherence}: ${percent === null ? COPY.noAdherence : `${percent}%`}`}
      accessibilityHint={COPY.adherenceHint}
      className="min-w-0 flex-1 items-center gap-1 rounded-card border border-separator bg-surface px-2 py-3"
    >
      {percent === null ? (
        <Text
          testID="trainer-today-no-adherence"
          numberOfLines={2}
          className="min-h-12 text-center text-subhead font-semibold text-label-secondary"
        >
          {COPY.noAdherence}
        </Text>
      ) : (
        // MO-06: the ring fills from 0 and the number counts up with it (both
        // settle at once under reduced motion — ProgressRing and CountUp own that).
        <ProgressRing
          progress={percent / 100}
          size={52}
          strokeWidth={5}
          color={colors.brand}
          trackColor={colors.surfaceSunken}
        >
          <CountUp
            value={percent}
            format={(v) => `${Math.round(v)}%`}
            numberOfLines={1}
            className="text-caption font-bold text-label"
          />
        </ProgressRing>
      )}
      <Text numberOfLines={2} className="text-center text-caption text-label-secondary">
        {COPY.adherence}
      </Text>
    </View>
  );
}

/**
 * §6.1 (4): active clients of 50, average adherence, quiet clients and (M3)
 * bookings this week, done of scheduled (CountUp numbers, MO-06). With the
 * bookings tile the four sit in two rows of two, readable at 320 pt.
 */
export function WeekStats({
  activeClients,
  maxClients,
  averageAdherence,
  quietClients,
  quietAfterDays,
  bookingsThisWeek = null,
}: {
  activeClients: number;
  maxClients: number;
  averageAdherence: number | null;
  quietClients: number;
  /** Lane K4: the trainer's threshold; absent from an older API (the 7-day workout rule). */
  quietAfterDays?: number | undefined;
  bookingsThisWeek?: { scheduled: number; done: number } | null;
}) {
  const clients = (
    <StatTile
      testID="trainer-today-stat-clients"
      value={String(activeClients)}
      count={activeClients}
      unit={COPY.activeOf(maxClients)}
      label={COPY.activeClients}
    />
  );
  const quiet = (
    <StatTile
      testID="trainer-today-stat-quiet"
      value={String(quietClients)}
      count={quietClients}
      label={COPY.quietClients}
      accessibilityHint={
        quietAfterDays !== undefined
          ? QUIET_COPY.statHint(quietAfterDays)
          : COPY.quietHint(COACHING_LIMITS.inactiveDays)
      }
    />
  );
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-title3 font-bold text-label">
        {COPY.thisWeek}
      </Text>
      {bookingsThisWeek ? (
        <View testID="trainer-today-stats" className="gap-2">
          <StatTiles>
            {clients}
            <AdherenceTile adherence={averageAdherence} />
          </StatTiles>
          <StatTiles>
            <StatTile
              testID="trainer-today-stat-bookings"
              value={String(bookingsThisWeek.done)}
              count={bookingsThisWeek.done}
              unit={COPY.activeOf(bookingsThisWeek.scheduled)}
              label={COPY.bookingsThisWeek}
              accessibilityLabel={`${COPY.bookingsThisWeek}: ${COPY.bookingsDone(
                bookingsThisWeek.done,
                bookingsThisWeek.scheduled,
              )}`}
            />
            {quiet}
          </StatTiles>
        </View>
      ) : (
        <StatTiles testID="trainer-today-stats">
          {clients}
          <AdherenceTile adherence={averageAdherence} />
          {quiet}
        </StatTiles>
      )}
    </View>
  );
}

/** Lane K4 (`withFood`): "Nothing logged for 4 days" (food counts while shared); else "4 days without a workout". */
function quietRowText(client: TrainerQuietClientDto, withFood: boolean): string {
  return withFood ? QUIET_COPY.row(client.inactiveDays) : COPY.quietRow(client.inactiveDays);
}

export function quietClientLabel(client: TrainerQuietClientDto, withFood = false): string {
  return [
    client.name,
    client.lastWorkoutDate
      ? COPY.lastWorkout(formatWeekdayDate(client.lastWorkoutDate))
      : COPY.noWorkoutYet,
    quietRowText(client, withFood),
  ].join('. ');
}

/** §6.1 (5): a quiet client — name, last workout, days without one. Tap → the client. */
export function QuietClientRow({
  client,
  withFood = false,
}: {
  client: TrainerQuietClientDto;
  /** Lane K4: the server judged "quiet" with food logs too (it sent `quietAfterDays`). */
  withFood?: boolean;
}) {
  const colors = useThemeColors();
  return (
    // MO-01: a card-sized tap target scales on press.
    <PressableScale
      testID={`trainer-today-quiet-${client.clientId}`}
      accessibilityRole="button"
      accessibilityLabel={quietClientLabel(client, withFood)}
      onPress={() => router.push(`/trainer/${client.clientId}`)}
      className="min-h-14 gap-1 rounded-card border border-separator bg-surface px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-headline font-semibold text-label" numberOfLines={1}>
          {client.name}
        </Text>
        <Icon name="chevronRight" color={colors.labelTertiary} size={16} />
      </View>
      <Text className="min-w-0 text-subhead text-label-secondary">
        {client.lastWorkoutDate
          ? COPY.lastWorkout(formatWeekdayDate(client.lastWorkoutDate))
          : COPY.noWorkoutYet}
      </Text>
      <View className="flex-row">
        <Badge variant="warning">{quietRowText(client, withFood)}</Badge>
      </View>
    </PressableScale>
  );
}

/** "14:05" for `dataUpdatedAt` (device clock, 24 h like the rest of the trainer screens). */
export function clockTime(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
