import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import type { GymBootstrap } from '@chefer/types';
import { Sheet, Text } from '@chefer/ui-mobile';
import { localDate } from '../offline/ids';

// "Log a workout you already did" (gym_plan.md §1.4 "Repair", research §4.2
// #5). Owner dogfood 2026-09-30 reworked it:
// - It opens LOG MODE (`/gym/workout?log=…`), not a live, timed workout: the
//   user sets the date, the duration, the exercises and each set's numbers,
//   then Save (`use-log-session.ts`).
// - One sheet, one question — which workout? The day is picked on the log
//   screen itself (it starts on today). The old two-step flow closed one
//   Modal and opened the next in the same frame, which iOS refuses: the
//   second sheet never appeared and its invisible Modal swallowed every tap
//   (the "app freezes" report, iPhone only).
// - Navigation waits for the sheet to be fully gone (`onExited`) for the same
//   reason.
// Showing this path is what weakens the "broken streak" effect (research
// §4.1): a missed day is repairable, not a permanent gap.

function logHref(date: string, dayId: string | null): Href {
  return dayId
    ? { pathname: '/gym/workout', params: { log: date, day: dayId } }
    : { pathname: '/gym/workout', params: { log: date } };
}

export function LogPastWorkoutAction({ bootstrap }: { bootstrap: GymBootstrap }) {
  const [open, setOpen] = useState(false);
  const pending = useRef<Href | null>(null);

  const pick = (dayId: string | null) => {
    pending.current = logHref(localDate(), dayId);
    setOpen(false);
  };

  const onExited = () => {
    const href = pending.current;
    pending.current = null;
    if (href) router.push(href);
  };

  const sortedDays = [...(bootstrap.activeRoutine?.days ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  return (
    <>
      <Pressable
        testID="gym-today-log-past"
        accessibilityRole="button"
        onPress={() => {
          pending.current = null;
          setOpen(true);
        }}
        className="min-h-11 justify-center"
      >
        <Text className="text-sm font-medium text-primary">Log a workout you already did</Text>
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        onExited={onExited}
        title="Which workout did you do?"
        testID="gym-today-backfill-day-picker"
      >
        <View className="gap-0">
          {sortedDays.map((day) => (
            <Pressable
              key={day.id}
              testID={`gym-today-backfill-day-${day.id}`}
              accessibilityRole="button"
              onPress={() => pick(day.id)}
              className="min-h-11 justify-center border-b border-border py-3"
            >
              <Text className="font-medium">{day.name}</Text>
            </Pressable>
          ))}
          <Pressable
            testID="gym-today-backfill-freestyle"
            accessibilityRole="button"
            onPress={() => pick(null)}
            className="min-h-11 justify-center py-3"
          >
            <Text className="font-medium text-primary">Freestyle</Text>
            <Text variant="muted" className="text-xs">
              Pick the exercises yourself.
            </Text>
          </Pressable>
        </View>
        <Text variant="muted" className="text-xs">
          You&apos;ll set the day, how long it took and your sets next.
        </Text>
      </Sheet>
    </>
  );
}
