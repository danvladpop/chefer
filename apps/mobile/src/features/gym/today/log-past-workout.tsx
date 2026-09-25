import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { GymBootstrap } from '@chefer/types';
import { Sheet, Text } from '@chefer/ui-mobile';
import {
  addDaysLocal,
  buildNextWorkout,
  equipmentProfileOf,
  progressionKey,
  weekStartOf,
  type ProgressionEntry,
} from '@chefer/utils';
import { localDate } from '../offline/ids';
import { useActiveWorkout } from '../use-active-workout';
import { libraryLookup } from '../use-gym-bootstrap';

// "Log a past workout" (gym_plan.md §1.4 "Repair", research §4.2 #5): pick a
// date in the current or previous week — never the future — then a routine
// day or freestyle. Starts a session backdated to that day at 18:00 local
// (use-active-workout.ts's `backfillDate`); the user logs the actual sets in
// the normal workout screen and finishes exactly like any other session.
// Showing this path is what weakens the "broken streak" effect (research
// §4.1): a missed day is repairable, not a permanent gap.

/** Every date from the Monday of the PREVIOUS week through yesterday, newest first. */
function eligibleBackfillDates(today: string): string[] {
  const start = weekStartOf(addDaysLocal(today, -7));
  const dates: string[] = [];
  for (let d = start; d < today; d = addDaysLocal(d, 1)) dates.push(d);
  return dates.reverse();
}

function formatDateLabel(date: string, today: string): string {
  if (date === addDaysLocal(today, -1)) return 'Yesterday';
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function LogPastWorkoutAction({ bootstrap }: { bootstrap: GymBootstrap }) {
  const activeWorkout = useActiveWorkout();
  const [step, setStep] = useState<'closed' | 'date' | 'day'>('closed');
  const [date, setDate] = useState<string | null>(null);

  const today = localDate();
  const close = () => {
    setStep('closed');
    setDate(null);
  };

  const pickDate = (d: string) => {
    setDate(d);
    setStep('day');
  };

  const goToWorkout = () => {
    close();
    router.push('/gym/workout');
  };

  const startFreestyle = () => {
    if (!date) return;
    activeWorkout.start({ kind: 'freestyle', name: 'Backfilled workout', backfillDate: date });
    goToWorkout();
  };

  const startDay = (dayId: string) => {
    if (!date || !bootstrap.activeRoutine || !bootstrap.profile) return;
    const progressions = new Map<string, ProgressionEntry>(
      bootstrap.progressions.map((p) => [
        progressionKey(p.exerciseId, p.repBucket),
        { state: p.state, override: p.override },
      ]),
    );
    const workout = buildNextWorkout({
      routine: bootstrap.activeRoutine,
      dayId,
      lookup: libraryLookup(bootstrap),
      progressions,
      profile: equipmentProfileOf(bootstrap.profile),
      facts: { experience: bootstrap.profile.experience, ageYears: null },
      today: date,
      recentSessions: bootstrap.recentSessions,
      isDeload: false,
    });
    activeWorkout.start({ kind: 'planned', workout, backfillDate: date });
    goToWorkout();
  };

  const dates = eligibleBackfillDates(today);
  const sortedDays = [...(bootstrap.activeRoutine?.days ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <>
      <Pressable
        testID="gym-today-log-past"
        accessibilityRole="button"
        onPress={() => setStep('date')}
        className="min-h-11 justify-center"
      >
        <Text className="text-sm font-medium text-primary">Log a past workout</Text>
      </Pressable>

      <Sheet
        visible={step === 'date'}
        onClose={close}
        title="Which day?"
        testID="gym-today-backfill-date-picker"
      >
        {dates.length === 0 ? (
          <Text variant="muted" className="px-1 py-3">
            No eligible days yet — check back after your first week.
          </Text>
        ) : (
          dates.map((d) => (
            <Pressable
              key={d}
              testID={`gym-today-backfill-date-${d}`}
              accessibilityRole="button"
              onPress={() => pickDate(d)}
              className="min-h-11 justify-center border-b border-border py-3"
            >
              <Text className="font-medium">{formatDateLabel(d, today)}</Text>
            </Pressable>
          ))
        )}
      </Sheet>

      <Sheet
        visible={step === 'day'}
        onClose={close}
        title="Which routine day?"
        testID="gym-today-backfill-day-picker"
      >
        <View className="gap-0">
          {sortedDays.map((day) => (
            <Pressable
              key={day.id}
              testID={`gym-today-backfill-day-${day.id}`}
              accessibilityRole="button"
              onPress={() => startDay(day.id)}
              className="min-h-11 justify-center border-b border-border py-3"
            >
              <Text className="font-medium">{day.name}</Text>
            </Pressable>
          ))}
          <Pressable
            testID="gym-today-backfill-freestyle"
            accessibilityRole="button"
            onPress={startFreestyle}
            className="min-h-11 justify-center py-3"
          >
            <Text className="font-medium text-primary">Freestyle</Text>
          </Pressable>
        </View>
      </Sheet>
    </>
  );
}
