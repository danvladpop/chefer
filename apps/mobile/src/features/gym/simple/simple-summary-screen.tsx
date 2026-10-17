import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import {
  EmptyState,
  ExplainSheet,
  IconButton,
  ListRow,
  ListSection,
  ProgressRing,
  Screen,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  estimateSessionKcal,
  isLoggedWorkout,
  toSessionSummary,
  workoutMinutes,
  workoutTypeLabel,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { TrainButton } from '../../shell/train/train-button';
import { formatStreakLine } from '../today/today-helpers';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { getFinished } from '../workout/finished-store';
import { goToday } from '../workout/summary-screen';
import { fallbackMeta } from '../workout/workout-model';

// "Keep it simple" summary (simple training mode §6.4): "Nice work", the
// workout type and its minutes, the ~kcal estimate (with "How we estimate
// this"), this week's count and streak, and the exercises ticked done. No
// PRs, volume, e1RM or "Next time" — none of it was tracked.

/** The finished workout this summary shows: the just-finished doc, else the cached copy. */
export function summarySessionOf(
  id: string,
  bootstrap: Pick<GymBootstrap, 'recentSessions'> | undefined,
): SessionSummaryDto | null {
  const doc = getFinished(id);
  if (doc) return toSessionSummary(doc);
  return bootstrap?.recentSessions.find((s) => s.id === id) ?? null;
}

export function SimpleSummaryScreen({ id }: { id: string }) {
  const colors = useThemeColors();
  const { data: bootstrap } = useGymBootstrap();
  const [howOpen, setHowOpen] = useState(false);
  const session = summarySessionOf(id, bootstrap);

  if (!session) {
    return (
      <Screen className="bg-canvas" edges={['top', 'bottom', 'left', 'right']}>
        <EmptyState
          testID="summary-missing"
          title="Workout saved"
          description="It will sync as soon as you have a connection."
          action={{ label: 'Done', onPress: goToday, testID: 'summary-done' }}
        />
      </Screen>
    );
  }

  const typeLabel = session.workoutType ? workoutTypeLabel(session.workoutType) : session.name;
  const minutes = workoutMinutes(session);
  const burn = estimateSessionKcal({ session, bodyweightKg: bootstrap?.bodyweightKg });
  const streak = bootstrap?.streak;
  const byId = new Map((bootstrap?.library ?? []).map((e) => [e.id, e]));
  // The exercises ticked done (a logged workout's one entry is the workout itself).
  const ticked = isLoggedWorkout(session)
    ? []
    : session.exercises.filter((e) => !e.skipped && e.sets.some((s) => s.completed));

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView testID="simple-summary" contentContainerClassName="gap-5 px-4 pb-8 pt-6">
        <View className="items-center gap-2">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-tint">
            <Icon name="checkmark" color={colors.brand} size={32} />
          </View>
          <Text
            testID="simple-summary-title"
            accessibilityRole="header"
            className="text-title1 font-bold text-label"
          >
            Nice work
          </Text>
          <Text testID="simple-summary-line" className="text-headline text-label">
            {`${typeLabel} · ${minutes} min`}
          </Text>
          {session.name !== typeLabel ? (
            <Text className="text-subhead text-label-secondary">{session.name}</Text>
          ) : null}
        </View>

        <View className="gap-1 rounded-card border border-separator bg-surface p-4">
          {burn ? (
            <View className="flex-row items-center gap-2">
              <Icon name="flame" color={colors.brand} size={20} />
              <Text
                testID="simple-summary-kcal"
                className="min-w-0 flex-1 text-headline font-semibold text-label"
              >
                {burn.isEstimate
                  ? `~${burn.kcal} kcal (est.)`
                  : `${burn.kcal} kcal (from your watch)`}
              </Text>
              <IconButton
                testID="simple-summary-how"
                accessibilityLabel="How we estimate this"
                icon={<Icon name="info" color={colors.brand} size={20} />}
                onPress={() => setHowOpen(true)}
              />
            </View>
          ) : (
            <Text testID="simple-summary-kcal-hint" className="text-subhead text-label-secondary">
              Log your weight to see calories
            </Text>
          )}
        </View>

        {streak ? (
          <View
            testID="simple-summary-week"
            className="flex-row items-center gap-3 rounded-card border border-separator bg-surface p-4"
          >
            <ProgressRing
              progress={
                streak.thisWeekGoal > 0
                  ? Math.min(1, streak.thisWeekSessions / streak.thisWeekGoal)
                  : 0
              }
              size={56}
              strokeWidth={6}
              color={colors.brand}
              trackColor={colors.surfaceSunken}
              accessibilityLabel={`${streak.thisWeekSessions} of ${streak.thisWeekGoal} this week`}
            >
              <Text className="text-callout font-bold text-label">
                {`${streak.thisWeekSessions}/${streak.thisWeekGoal}`}
              </Text>
            </ProgressRing>
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="text-headline font-semibold text-label">
                {`${streak.thisWeekSessions} of ${streak.thisWeekGoal} this week`}
              </Text>
              {streak.current > 0 ? (
                <Text testID="simple-summary-streak" className="text-subhead text-label-secondary">
                  {formatStreakLine(streak)}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {ticked.length > 0 ? (
          <ListSection title="Exercises" testID="simple-summary-exercises">
            {ticked.map((e, i) => (
              <ListRow
                key={`${e.exerciseId}-${i}`}
                title={(byId.get(e.exerciseId) ?? fallbackMeta(e.exerciseId)).name}
                value="done"
                icon={<Icon name="checkmarkCircle" color={colors.positive} />}
                accessory="none"
              />
            ))}
          </ListSection>
        ) : null}

        <TrainButton testID="summary-done" label="Done" size="lg" onPress={goToday} />
      </ScrollView>

      <ExplainSheet
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        title="How we estimate this"
        sentence={`We multiply a typical effort for ${typeLabel} by your body weight and the workout's time. Your watch's number wins when you enter one. It never changes your food targets.`}
        rows={[]}
        testID="simple-summary-how-sheet"
      />
    </Screen>
  );
}
