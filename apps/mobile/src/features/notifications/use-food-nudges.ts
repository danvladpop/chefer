import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { trpc } from '../../lib/trpc';
import { localDate } from '../gym/offline/ids';
import {
  getFoodNudgePrefs,
  subscribeFoodNudgePrefs,
  syncFoodNudges,
  type FoodNudgePrefs,
} from './food-nudges';

// Keeps the scheduled food nudges true (UX-PO-08): re-plans the dinner window
// and the Sunday nudge on launch, whenever the app returns to the foreground,
// when the stored choice changes, and when today's log gains or loses a dinner
// entry (so logging dinner at 19:00 drops tonight's 20:30 nudge). Permission is
// only checked, never asked. Mounted once in the root layout.

/** Reactive read of the stored choice. */
export function useFoodNudgePrefs(): FoodNudgePrefs {
  return useSyncExternalStore(subscribeFoodNudgePrefs, getFoodNudgePrefs);
}

export function useFoodNudges(signedIn: boolean): void {
  const prefs = useFoodNudgePrefs();
  // The day query is only read while the dinner nudge is on, so a user who never
  // opted in costs the API nothing.
  const [today, setToday] = useState(() => localDate());
  const dayQuery = trpc.tracker.getDay.useQuery(
    { date: today },
    { enabled: signedIn && prefs.dinner },
  );
  const dayLoaded = dayQuery.data !== undefined;
  const dinnerLogged =
    dayQuery.data?.log?.loggedMeals.some((m) => m.mealType.toLowerCase() === 'dinner') ?? false;

  useEffect(() => {
    if (!signedIn) return;
    // Wait for the day when the dinner nudge needs it, so tonight's nudge is
    // never scheduled and then cancelled a moment later.
    if (prefs.dinner && !dayLoaded && !dayQuery.isError) return;
    const run = () => void syncFoodNudges({ prefs, dinnerLoggedToday: dinnerLogged });
    run();
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status !== 'active') return;
      // A new calendar day is a new day query; its arrival re-runs this effect.
      const current = localDate();
      if (current !== today) setToday(current);
      else run();
    });
    return () => subscription.remove();
  }, [signedIn, prefs, dinnerLogged, dayLoaded, dayQuery.isError, today]);
}

/** Renders nothing; exists so the root layout can mount `useFoodNudges` inside the tRPC provider. */
export function FoodNudgeHost({ signedIn }: { signedIn: boolean }): null {
  useFoodNudges(signedIn);
  return null;
}
