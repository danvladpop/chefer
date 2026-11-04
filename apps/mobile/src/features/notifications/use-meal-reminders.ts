import { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { activeReminderSlots, loggedMealSlots } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { localDate } from '../gym/offline/ids';
import { syncMealReminders } from './meal-reminders';

// Keeps the scheduled meal-time reminders true (lane E1): re-plans the window
// on launch, whenever the app returns to the foreground, when the stored
// choice changes and when today's log gains or loses a meal (so ticking lunch
// at 12:10 drops today's 12:30 "Lunch time"). Permission is only checked,
// never asked. Mounted once in the root layout.

export function useMealReminders(signedIn: boolean): void {
  const settings = trpc.notifications.getMealReminders.useQuery(undefined, {
    enabled: signedIn,
    staleTime: 60_000,
  });
  const reminders = settings.data?.reminders;
  const active = reminders ? activeReminderSlots(reminders).length > 0 : false;
  // Today's log is only read while a reminder is on, so a user who never
  // opted in costs the API nothing.
  const [today, setToday] = useState(() => localDate());
  const dayQuery = trpc.tracker.getDay.useQuery({ date: today }, { enabled: signedIn && active });
  const loggedMeals = dayQuery.data?.log?.loggedMeals;
  // A stable key, so a refetch with the same meals doesn't re-plan.
  const doneKey = useMemo(
    () => [...loggedMealSlots(loggedMeals ?? [])].sort().join(','),
    [loggedMeals],
  );
  const dayReady = dayQuery.data !== undefined || dayQuery.isError;

  useEffect(() => {
    if (!signedIn || !settings.data) return;
    // Wait for the day, so today's reminder is never scheduled and then
    // cancelled a moment later.
    if (active && !dayReady) return;
    const { reminders: current, planDays } = settings.data;
    const doneToday = loggedMealSlots(
      doneKey
        .split(',')
        .filter(Boolean)
        .map((mealType) => ({ mealType })),
    );
    const run = () => void syncMealReminders({ reminders: current, planDays, doneToday });
    run();
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status !== 'active') return;
      // A new calendar day is a new day query; its arrival re-runs this effect.
      const now = localDate();
      if (now !== today) setToday(now);
      else run();
    });
    return () => subscription.remove();
  }, [signedIn, settings.data, active, dayReady, doneKey, today]);
}

/** Renders nothing; exists so the root layout can mount `useMealReminders` inside the tRPC provider. */
export function MealReminderHost({ signedIn }: { signedIn: boolean }): null {
  useMealReminders(signedIn);
  return null;
}
