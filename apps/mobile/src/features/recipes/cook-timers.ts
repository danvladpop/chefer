import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { haptics } from '@chefer/ui-mobile';
import {
  cookTimerRemaining,
  cookTimerStatus,
  newCookTimer,
  pauseCookTimer,
  resetCookTimer,
  startCookTimer,
  type CookTimer,
} from '@chefer/utils';
import { ensureRestNotificationPermission, hasRestNotificationPermission } from '../gym/rest-timer';

// UX-COOK-01: step timers live at SCREEN level as absolute `endsAt` stamps.
// They used to live inside the step view, so changing step threw the running
// timer away, nothing told you at zero, and iOS froze the 1 s interval in the
// background. Now a step's timer keeps running while you read the next step,
// the header shows every timer that is going, the foreground end buzzes, and a
// local notification (scheduled at start, cancelled on pause / reset / finish)
// covers the phone being in your pocket.

const ANDROID_CHANNEL_ID = 'cook-timer';
const TICK_MS = 500;

export type CookTimers = Record<number, CookTimer>;

/** What the screen needs to render one timer chip / the step's big timer. */
export type CookTimerView = {
  step: number;
  timer: CookTimer;
  status: ReturnType<typeof cookTimerStatus>;
  remainingSec: number;
};

async function scheduleEndNotification(
  recipeName: string,
  step: number,
  endsAt: number,
): Promise<string | null> {
  if (endsAt - Date.now() < 1000) return null;
  try {
    // Only ever asked from the tap that starts a timer (a user action).
    const granted =
      (await hasRestNotificationPermission()) || (await ensureRestNotificationPermission());
    if (!granted) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Cooking timers',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
      });
    }
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Timer done',
        body: `Step ${step + 1} of ${recipeName} is ready.`,
        sound: true,
        data: { kind: 'cook-timer' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: endsAt,
        channelId: ANDROID_CHANNEL_ID,
      },
    });
  } catch {
    // Notifications are a convenience; the timer itself is unaffected.
    return null;
  }
}

async function cancelNotification(id: string | undefined): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already delivered or gone.
  }
}

/**
 * The cook screen's timers. `initial` is what the session store remembered
 * (timers keep their absolute end, so a timer that finished while you were
 * away reads "Time!" without a late buzz).
 */
export function useCookTimers(
  recipeName: string,
  initial: CookTimers,
  initialNotifications: Record<number, string>,
) {
  const [timers, setTimers] = useState<CookTimers>(initial);
  // Mirror of `timers` so the actions below stay pure state transitions with
  // their side effects (notifications) outside any state updater.
  const timersRef = useRef<CookTimers>(initial);
  const commit = useCallback((next: CookTimers) => {
    timersRef.current = next;
    setTimers(next);
  }, []);
  const [now, setNow] = useState(() => Date.now());
  const notifications = useRef<Record<number, string>>({ ...initialNotifications });
  // Bumped when a scheduled notification id arrives (async), so the screen
  // re-saves the session with it.
  const [notificationVersion, setNotificationVersion] = useState(0);
  // `${step}:${endsAt}` of every timer whose end was already announced.
  const announced = useRef<Set<string>>(
    new Set(
      Object.entries(initial)
        .filter(([, t]) => t.endsAt !== null && t.endsAt <= Date.now())
        .map(([step, t]) => `${step}:${t.endsAt}`),
    ),
  );
  const nameRef = useRef(recipeName);
  useEffect(() => {
    nameRef.current = recipeName;
  }, [recipeName]);

  const anyRunning = Object.values(timers).some((t) => t.endsAt !== null);

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      for (const [step, timer] of Object.entries(timers)) {
        if (timer.endsAt === null || timer.endsAt > t) continue;
        const key = `${step}:${timer.endsAt}`;
        if (announced.current.has(key)) continue;
        announced.current.add(key);
        haptics.warning();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [anyRunning, timers]);

  const cancelFor = useCallback((step: number) => {
    const { [step]: id, ...rest } = notifications.current;
    notifications.current = rest;
    void cancelNotification(id);
  }, []);

  const scheduleFor = useCallback(
    (step: number, endsAt: number) => {
      cancelFor(step);
      void scheduleEndNotification(nameRef.current, step, endsAt).then((id) => {
        if (id) {
          notifications.current[step] = id;
          setNotificationVersion((v) => v + 1);
        }
      });
    },
    [cancelFor],
  );

  /** Tap on a timer: start / resume, pause, or (when finished) reset. */
  const toggle = useCallback(
    (step: number, durationSec: number) => {
      const t = Date.now();
      setNow(t);
      const prev = timersRef.current;
      const current = prev[step] ?? newCookTimer(durationSec);
      const status = cookTimerStatus(current, t);
      if (status === 'running') {
        cancelFor(step);
        commit({ ...prev, [step]: pauseCookTimer(current, t) });
      } else if (status === 'done') {
        cancelFor(step);
        commit({ ...prev, [step]: resetCookTimer(current) });
      } else {
        const started = startCookTimer(current, t);
        if (started.endsAt !== null) scheduleFor(step, started.endsAt);
        commit({ ...prev, [step]: started });
      }
    },
    [cancelFor, scheduleFor, commit],
  );

  const reset = useCallback(
    (step: number) => {
      cancelFor(step);
      const current = timersRef.current[step];
      if (current) commit({ ...timersRef.current, [step]: resetCookTimer(current) });
    },
    [cancelFor, commit],
  );

  /** Finishing the recipe ends every timer and its notification. */
  const stopAll = useCallback(() => {
    for (const id of Object.values(notifications.current)) void cancelNotification(id);
    notifications.current = {};
    commit({});
  }, [commit]);

  const view = (step: number, durationSec: number): CookTimerView => {
    const timer = timers[step] ?? newCookTimer(durationSec);
    return {
      step,
      timer,
      status: cookTimerStatus(timer, now),
      remainingSec: cookTimerRemaining(timer, now),
    };
  };

  /** Timers that are running, paused or finished, for the header chips. */
  const active: CookTimerView[] = Object.entries(timers)
    .map(([step, timer]) => ({
      step: Number(step),
      timer,
      status: cookTimerStatus(timer, now),
      remainingSec: cookTimerRemaining(timer, now),
    }))
    .filter((v) => v.status !== 'idle')
    .sort((a, b) => a.step - b.step);

  return {
    timers,
    notificationIds: notifications,
    notificationVersion,
    now,
    view,
    active,
    toggle,
    reset,
    stopAll,
  };
}
