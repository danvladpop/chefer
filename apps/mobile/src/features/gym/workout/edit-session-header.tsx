import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Chip, Sheet, Text, TimePicker, type TimeOfDay } from '@chefer/ui-mobile';
import { addDaysLocal, weekdayDateLabel, weekStartOf } from '@chefer/utils';
import { localDate } from '../offline/ids';
import { localInstant } from '../reminders/schedule';

// Edit mode's header (UX-44, T-44.3): `Cancel · Editing {weekday d Mon} · Save`
// over the workout's name, date and time with a `Change ›` sheet. The sheet
// offers the dates `Log a past workout` offers (Monday of last week → today)
// plus the session's own date, and the kit TimePicker — never a future time.

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Monday of last week through today, newest first, always including `current`. */
export function editableDates(today: string, current: string): string[] {
  const start = weekStartOf(addDaysLocal(today, -7));
  const dates: string[] = [];
  for (let d = today; d >= start; d = addDaysLocal(d, -1)) dates.push(d);
  if (!dates.includes(current)) dates.push(current);
  return dates.sort().reverse();
}

function timeOf(iso: string): TimeOfDay {
  const d = new Date(iso);
  return { hour: d.getHours(), minute: d.getMinutes() };
}

export function formatTime(iso: string): string {
  const { hour, minute } = timeOf(iso);
  return `${pad2(hour)}:${pad2(minute)}`;
}

function dateChipLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDaysLocal(today, -1)) return 'Yesterday';
  return weekdayDateLabel(date);
}

export interface EditSessionHeaderProps {
  name: string;
  localDate: string;
  startedAt: string;
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
  onChangeWhen: (input: { localDate: string; startedAt: string }) => void;
}

export function EditSessionHeader({
  name,
  localDate: sessionDate,
  startedAt,
  saving = false,
  onCancel,
  onSave,
  onChangeWhen,
}: EditSessionHeaderProps) {
  const [open, setOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(sessionDate);
  const [pickedTime, setPickedTime] = useState<TimeOfDay>(timeOf(startedAt));
  const today = localDate();
  const dates = editableDates(today, sessionDate);

  const openSheet = () => {
    setPickedDate(sessionDate);
    setPickedTime(timeOf(startedAt));
    setOpen(true);
  };

  const apply = () => {
    setOpen(false);
    onChangeWhen({
      localDate: pickedDate,
      startedAt: localInstant(pickedDate, `${pad2(pickedTime.hour)}:${pad2(pickedTime.minute)}`),
    });
  };

  return (
    <View className="border-b border-border px-2 pb-2 pt-1">
      <View className="flex-row items-center justify-between">
        <Pressable
          testID="edit-session-cancel"
          accessibilityRole="button"
          onPress={onCancel}
          className="min-h-11 min-w-11 justify-center px-2"
        >
          <Text className="text-base text-primary">Cancel</Text>
        </Pressable>
        <Text
          testID="edit-session-title"
          accessibilityRole="header"
          accessibilityLabel={`Editing ${name}, ${weekdayDateLabel(sessionDate)}`}
          className="min-w-0 flex-1 text-center text-base font-semibold"
          numberOfLines={1}
        >
          {`Editing · ${weekdayDateLabel(sessionDate)}`}
        </Text>
        <Button testID="edit-session-save" size="sm" loading={saving} onPress={onSave}>
          Save
        </Button>
      </View>
      <View className="flex-row items-center justify-between gap-2 px-2">
        <Text
          testID="edit-session-subtitle"
          variant="muted"
          className="min-w-0 flex-1"
          numberOfLines={1}
        >
          {`${name} · ${weekdayDateLabel(sessionDate)} · ${formatTime(startedAt)}`}
        </Text>
        <Pressable
          testID="edit-session-change-when"
          accessibilityRole="button"
          accessibilityLabel="Change date and time"
          onPress={openSheet}
          className="min-h-11 justify-center pl-2"
        >
          <Text className="text-sm font-medium text-primary">Change ›</Text>
        </Pressable>
      </View>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="When was this workout?"
        testID="edit-session-when-sheet"
        footer={
          <Button testID="edit-session-when-done" size="lg" onPress={apply}>
            Done
          </Button>
        }
      >
        <Text variant="label">Day</Text>
        <View className="flex-row flex-wrap gap-2">
          {dates.map((d) => (
            <Chip
              key={d}
              testID={`edit-session-when-date-${d}`}
              label={dateChipLabel(d, today)}
              selected={pickedDate === d}
              onPress={() => setPickedDate(d)}
            />
          ))}
        </View>
        <Text variant="label" className="mt-2">
          Time
        </Text>
        <TimePicker testID="edit-session-when-time" value={pickedTime} onChange={setPickedTime} />
      </Sheet>
    </View>
  );
}
