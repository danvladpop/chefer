import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import type { MealReminders, PlanSlot } from '@chefer/types';
import { MEAL_REMINDER_DEFAULT_TIMES, MEAL_REMINDER_SLOTS } from '@chefer/types';
import { Button, Sheet, Text, TimePicker, useThemeColors, type TimeOfDay } from '@chefer/ui-mobile';
import { activeReminderSlots, ENGAGEMENT_COPY, mealReminderLabel } from '@chefer/utils';
import { NotificationsOffRow } from '../../components/notifications-off-row';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../lib/use-notification-permission';
import { ensureGymReminderPermission } from '../gym/reminders/permission';

// Settings → Notifications "Mealtime reminders" (lane E1): the master switch,
// then one row per meal with its time and its own switch. The value lives on
// the server (`notifications.getMealReminders`); the root MealReminderHost
// re-plans the phone's notifications whenever it changes. Turning reminders
// on is a user action, so it is where the OS permission is asked; a refusal
// leaves them off and shows the standard "Off for Chefer" row.

const pad = (n: number) => String(n).padStart(2, '0');
const toTime = (t: TimeOfDay) => `${pad(t.hour)}:${pad(t.minute)}`;
function fromTime(time: string): TimeOfDay {
  const [hour = 8, minute = 0] = time.split(':').map(Number);
  // The picker offers quarter hours; a stored 5-minute value snaps down for display.
  return { hour, minute: minute - (minute % 15) };
}

/** Saves through the shared query with an optimistic update (rolled back on failure). */
export function useSaveMealReminders() {
  const utils = trpc.useUtils();
  return trpc.notifications.setMealReminders.useMutation({
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
    onError: (_error, _next, context) => {
      if (context?.previous)
        utils.notifications.getMealReminders.setData(undefined, context.previous);
    },
    onSettled: () => void utils.notifications.getMealReminders.invalidate(),
  });
}

function ReminderSwitch(props: {
  testID: string;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const colors = useThemeColors();
  return (
    <Switch
      testID={props.testID}
      accessibilityLabel={props.label}
      value={props.value}
      onValueChange={props.onChange}
      trackColor={{ true: colors.brand, false: colors.separator }}
    />
  );
}

export function MealReminderSettings({ testIDPrefix }: { testIDPrefix: string }) {
  const colors = useThemeColors();
  const query = trpc.notifications.getMealReminders.useQuery();
  const save = useSaveMealReminders();
  const permission = useNotificationPermission();
  const [refused, setRefused] = useState(false);
  const [editing, setEditing] = useState<PlanSlot | null>(null);
  const [draftTime, setDraftTime] = useState<TimeOfDay>({ hour: 8, minute: 0 });
  const denied = permission === 'denied' || refused;

  const data = query.data;
  if (!data) return null;
  const { reminders } = data;
  const write = (next: MealReminders) => {
    track('meal_reminders_changed', {
      enabled: next.enabled,
      meals: activeReminderSlots(next).length,
      surface: 'mobile',
    });
    save.mutate(next);
  };

  const setEnabled = (next: boolean) => {
    if (!next) {
      setRefused(false);
      write({ ...reminders, enabled: false });
      return;
    }
    void ensureGymReminderPermission().then((allowed) => {
      refreshNotificationPermission();
      setRefused(!allowed);
      if (allowed) write({ ...reminders, enabled: true });
    });
  };

  const setSlot = (slot: PlanSlot, time: string | null) =>
    write({ ...reminders, times: { ...reminders.times, [slot]: time } });

  const on = reminders.enabled && !denied;

  return (
    <View className="gap-1" testID={testIDPrefix}>
      <View className="min-h-11 flex-row items-center justify-between gap-3 py-1">
        <View className="min-w-0 flex-1">
          <Text className="text-body text-label">{ENGAGEMENT_COPY.remindersMasterLabel}</Text>
          <Text className="mt-0.5 text-subhead text-label-secondary">
            {ENGAGEMENT_COPY.remindersCardBody}
          </Text>
        </View>
        <ReminderSwitch
          testID={`${testIDPrefix}-master`}
          label={ENGAGEMENT_COPY.remindersMasterLabel}
          value={on}
          onChange={setEnabled}
        />
      </View>
      {on &&
        MEAL_REMINDER_SLOTS.map((slot) => {
          const time = reminders.times[slot];
          const label = mealReminderLabel(slot);
          return (
            <View
              key={slot}
              className="min-h-11 flex-row items-center gap-3 border-t border-separator py-1"
            >
              <Text className="min-w-0 flex-1 text-body text-label">{label}</Text>
              {time !== null && (
                <Pressable
                  testID={`${testIDPrefix}-${slot}-time`}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} reminder time, ${time}. Change`}
                  onPress={() => {
                    setDraftTime(fromTime(time));
                    setEditing(slot);
                  }}
                  className="min-h-11 justify-center rounded-control px-3"
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? colors.surfaceSunken : colors.brandTint,
                  })}
                >
                  <Text className="text-body font-semibold text-brand">{time}</Text>
                </Pressable>
              )}
              <ReminderSwitch
                testID={`${testIDPrefix}-${slot}`}
                label={`${label} reminder`}
                value={time !== null}
                onChange={(next) => setSlot(slot, next ? MEAL_REMINDER_DEFAULT_TIMES[slot] : null)}
              />
            </View>
          );
        })}
      {denied && (
        <NotificationsOffRow
          testID={`${testIDPrefix}-off`}
          message={ENGAGEMENT_COPY.remindersOff}
        />
      )}
      <Sheet
        visible={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${mealReminderLabel(editing)} reminder` : ''}
        testID={`${testIDPrefix}-time-sheet`}
      >
        <View className="gap-4 pb-2">
          <TimePicker
            value={draftTime}
            onChange={setDraftTime}
            testID={`${testIDPrefix}-time-picker`}
          />
          <Button
            testID={`${testIDPrefix}-time-save`}
            onPress={() => {
              if (editing) setSlot(editing, toTime(draftTime));
              setEditing(null);
            }}
          >
            Save time
          </Button>
        </View>
      </Sheet>
    </View>
  );
}
