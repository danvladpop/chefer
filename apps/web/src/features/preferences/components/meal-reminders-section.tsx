'use client';

import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import {
  MEAL_REMINDER_DEFAULT_TIMES,
  MEAL_REMINDER_SLOTS,
  type MealReminders,
  type PlanSlot,
} from '@chefer/types';
import { Switch } from '@chefer/ui';
import { activeReminderSlots, ENGAGEMENT_COPY, mealReminderLabel } from '@chefer/utils';

// Mealtime reminders (market review 2026-10, lane E1): web shows and edits
// the same `notifications.getMealReminders` value the phone schedules from.
// Web sends nothing itself — no push, no browser notifications — so the card
// says where the reminders arrive.

/** `<input type="time">` gives "HH:MM"; the schema wants 5-minute steps. */
function toFiveMinutes(value: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minute = Number(match[2]);
  return `${match[1]}:${String(minute - (minute % 5)).padStart(2, '0')}`;
}

export function MealRemindersSection() {
  const utils = trpc.useUtils();
  const query = trpc.notifications.getMealReminders.useQuery();
  const save = trpc.notifications.setMealReminders.useMutation({
    meta: { silent: true },
    onMutate: async (next) => {
      await utils.notifications.getMealReminders.cancel();
      const previous = utils.notifications.getMealReminders.getData();
      if (previous) {
        utils.notifications.getMealReminders.setData(undefined, {
          ...previous,
          reminders: next,
          chosen: true,
        });
      }
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous)
        utils.notifications.getMealReminders.setData(undefined, context.previous);
    },
    onSettled: () => void utils.notifications.getMealReminders.invalidate(),
  });

  const data = query.data;
  if (!data) return null;
  const { reminders } = data;

  const write = (next: MealReminders) => {
    capture('meal_reminders_changed', {
      enabled: next.enabled,
      meals: activeReminderSlots(next).length,
      surface: 'web',
    });
    save.mutate(next);
  };
  const setSlot = (slot: PlanSlot, time: string | null) =>
    write({ ...reminders, times: { ...reminders.times, [slot]: time } });

  return (
    <section
      id="meal-reminders"
      aria-labelledby="meal-reminders-heading"
      className="mt-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id="meal-reminders-heading" className="font-semibold text-gray-900">
        {ENGAGEMENT_COPY.remindersCardTitle}
      </h2>
      <p className="mt-1 text-sm text-gray-500">{ENGAGEMENT_COPY.remindersWebNote}</p>

      <div className="mt-2 flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <p id="meal-reminders-master" className="text-sm font-medium text-gray-900">
            {ENGAGEMENT_COPY.remindersMasterLabel}
          </p>
          <p className="text-xs text-gray-500">{ENGAGEMENT_COPY.remindersCardBody}</p>
        </div>
        <Switch
          checked={reminders.enabled}
          onCheckedChange={(enabled) => write({ ...reminders, enabled })}
          aria-labelledby="meal-reminders-master"
        />
      </div>

      {reminders.enabled && (
        <ul className="divide-y border-t" data-testid="meal-reminders-rows">
          {MEAL_REMINDER_SLOTS.map((slot) => {
            const time = reminders.times[slot];
            const label = mealReminderLabel(slot);
            return (
              <li key={slot} className="flex min-h-11 items-center gap-3 py-2">
                <p id={`meal-reminder-${slot}`} className="min-w-0 flex-1 text-sm text-gray-900">
                  {label}
                </p>
                {time !== null && (
                  <input
                    type="time"
                    step={300}
                    value={time}
                    aria-label={`${label} reminder time`}
                    onChange={(event) => {
                      const next = toFiveMinutes(event.target.value);
                      if (next) setSlot(slot, next);
                    }}
                    className="min-h-11 rounded-lg border px-2 text-sm"
                  />
                )}
                <Switch
                  checked={time !== null}
                  onCheckedChange={(on) =>
                    setSlot(slot, on ? MEAL_REMINDER_DEFAULT_TIMES[slot] : null)
                  }
                  aria-labelledby={`meal-reminder-${slot}`}
                />
              </li>
            );
          })}
        </ul>
      )}

      {save.isError && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Couldn&apos;t save that. Try again.
        </p>
      )}
    </section>
  );
}
