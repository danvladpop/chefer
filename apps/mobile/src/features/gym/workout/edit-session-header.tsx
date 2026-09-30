import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { addDaysLocal, weekdayDateLabel, weekStartOf } from '@chefer/utils';
import { localDate } from '../offline/ids';
import { SessionWhenFields } from './session-when-fields';

// The header of the logger over a past workout.
// - Edit mode (UX-44, T-44.3): `Cancel · Editing {weekday d Mon} · Save` over
//   the workout's name, date and duration with a `Change ›` sheet.
// - Log mode (owner dogfood 2026-09-30, "log a workout you already did"):
//   `Cancel · Log workout · Save`, with the date and duration inline.
// Either way the `When` is just a day (Monday of last week → today, never the
// future — the same range `Log a past workout` offers, plus the session's own
// date) and a duration in minutes: no clock time.

/** The earliest day a past workout can be moved to or logged on. */
export function earliestWhenDate(today: string, current: string): string {
  const start = weekStartOf(addDaysLocal(today, -7));
  return current < start ? current : start;
}

export interface WhenValue {
  localDate: string;
  durationMin: number;
}

export interface EditSessionHeaderProps {
  mode: 'edit' | 'log';
  name: string;
  localDate: string;
  durationMin: number;
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
  onChangeWhen: (input: WhenValue) => void;
}

export function EditSessionHeader({
  mode,
  name,
  localDate: sessionDate,
  durationMin,
  saving = false,
  onCancel,
  onSave,
  onChangeWhen,
}: EditSessionHeaderProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<WhenValue>({ localDate: sessionDate, durationMin });
  const today = localDate();
  const logging = mode === 'log';
  // The session's ORIGINAL date stays reachable even if it's older than the range.
  const [minDate] = useState(() => earliestWhenDate(today, sessionDate));

  const openSheet = () => {
    setPicked({ localDate: sessionDate, durationMin });
    setOpen(true);
  };

  const apply = () => {
    setOpen(false);
    onChangeWhen(picked);
  };

  const title = logging ? 'Log workout' : `Editing · ${weekdayDateLabel(sessionDate)}`;

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
          accessibilityLabel={
            logging ? `Log ${name}` : `Editing ${name}, ${weekdayDateLabel(sessionDate)}`
          }
          className="min-w-0 flex-1 text-center text-base font-semibold"
          numberOfLines={1}
        >
          {title}
        </Text>
        <Button testID="edit-session-save" size="sm" loading={saving} onPress={onSave}>
          Save
        </Button>
      </View>

      {logging ? (
        <View className="gap-2 px-2 pt-2">
          <Text testID="edit-session-subtitle" variant="muted" numberOfLines={1}>
            {name}
          </Text>
          <SessionWhenFields
            testID="edit-session-when"
            localDate={sessionDate}
            durationMin={durationMin}
            minDate={minDate}
            today={today}
            onChangeDate={(d) => onChangeWhen({ localDate: d, durationMin })}
            onChangeDuration={(m) => onChangeWhen({ localDate: sessionDate, durationMin: m })}
          />
        </View>
      ) : (
        <View className="flex-row items-center justify-between gap-2 px-2">
          <Text
            testID="edit-session-subtitle"
            variant="muted"
            className="min-w-0 flex-1"
            numberOfLines={1}
          >
            {`${name} · ${weekdayDateLabel(sessionDate)} · ${durationMin} min`}
          </Text>
          <Pressable
            testID="edit-session-change-when"
            accessibilityRole="button"
            accessibilityLabel="Change date and duration"
            onPress={openSheet}
            className="min-h-11 justify-center pl-2"
          >
            <Text className="text-sm font-medium text-primary">Change ›</Text>
          </Pressable>
        </View>
      )}

      {logging ? null : (
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
          <SessionWhenFields
            testID="edit-session-when"
            localDate={picked.localDate}
            durationMin={picked.durationMin}
            minDate={minDate}
            today={today}
            onChangeDate={(d) => setPicked((p) => ({ ...p, localDate: d }))}
            onChangeDuration={(m) => setPicked((p) => ({ ...p, durationMin: m }))}
          />
        </Sheet>
      )}
    </View>
  );
}
