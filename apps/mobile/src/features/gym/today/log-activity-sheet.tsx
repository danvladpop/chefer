import { useId, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  ACTIVITY_LOG_EXERCISE_IDS,
  ACTIVITY_MAX_DURATION_MIN,
  ACTIVITY_MAX_KCAL,
  ACTIVITY_NAME_MAX_LENGTH,
  ACTIVITY_PRESETS,
  type GymBootstrap,
} from '@chefer/types';
import {
  Button,
  ChipGroup,
  FormField,
  haptics,
  Input,
  NumericReturnBar,
  Sheet,
  Text,
  useSnackbar,
} from '@chefer/ui-mobile';
import {
  activityMinDate,
  activitySessionName,
  buildActivityLogDoc,
  userFacingErrorMessage,
  validateActivityLog,
} from '@chefer/utils';
import { localDate, newId, nowIso } from '../offline/ids';
import { localInstant } from '../reminders/schedule';
import { saveLoggedSession } from '../use-active-workout';
import { libraryLookup } from '../use-gym-bootstrap';
import { EffortChips } from '../workout/effort-chips';
import { DateStepper } from '../workout/session-when-fields';
import { isCardioMeta } from '../workout/workout-model';

// "Log an activity" (WP-20, owner decision 2026-10-04): a class or session done
// elsewhere — "45 min cycling class, 400 kcal" — recorded as DONE. One short
// sheet: what, how long, (optionally) which day / kcal / effort. The common case
// is three taps inside the sheet: an activity chip, a duration chip, Save.
//
// It stores a finished gym session with one DURATION entry through the same
// offline outbox as any workout (`saveLoggedSession`), so it works offline and
// syncs like one. RECORD ONLY: the kcal is shown back in history and never
// reaches a food target, the planner or a rebalance.

/** Quick duration chips (minutes); the field next to them takes anything else. */
const DURATION_CHIPS = [15, 30, 45, 60, 90] as const;

/** An activity starts at this local time on its day (like a past-workout log). */
const ACTIVITY_START_TIME = '18:00';

const ACTIVITY_OPTIONS = ACTIVITY_PRESETS.map((p) => ({
  value: p.key,
  label: p.label,
  testID: `log-activity-chip-${p.key}`,
}));

const DURATION_OPTIONS = DURATION_CHIPS.map((m) => ({
  value: m,
  label: `${m} min`,
  testID: `log-activity-duration-chip-${m}`,
}));

function digitsOnly(text: string, maxLength: number): string {
  return text.replace(/[^0-9]/g, '').slice(0, maxLength);
}

function numberOrUndefined(text: string): number | undefined {
  return text === '' ? undefined : Number(text);
}

function ActivityForm({ bootstrap, onDone }: { bootstrap: GymBootstrap; onDone: () => void }) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const barId = `log-activity-numeric-bar-${useId()}`;
  const today = localDate();

  const [presetKey, setPresetKey] = useState<string | undefined>(undefined);
  const [customName, setCustomName] = useState('');
  const [date, setDate] = useState(today);
  const [minutesText, setMinutesText] = useState('');
  const [kcalText, setKcalText] = useState('');
  const [effort, setEffort] = useState<number | undefined>(undefined);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);

  const minutes = numberOrUndefined(minutesText);
  const kcal = numberOrUndefined(kcalText);
  const errors = validateActivityLog({
    ...(presetKey !== undefined && { presetKey }),
    customName,
    localDate: date,
    ...(minutes !== undefined && { durationMin: minutes }),
    ...(kcal !== undefined && { caloriesKcal: kcal }),
    ...(effort !== undefined && { effort }),
    today,
  });
  const shown = attempted ? errors : {};

  const onSave = async () => {
    if (saving) return;
    if (Object.keys(errors).length > 0 || !presetKey || minutes === undefined) {
      setAttempted(true);
      haptics.warning();
      return;
    }
    const input = {
      presetKey,
      customName,
      localDate: date,
      durationMin: minutes,
      ...(kcal !== undefined && { caloriesKcal: kcal }),
      ...(effort !== undefined && { effort }),
    };
    const lookup = libraryLookup(bootstrap);
    const doc = buildActivityLogDoc({
      input,
      id: newId(),
      newId,
      startAt: localInstant(date, ACTIVITY_START_TIME),
      now: nowIso(),
    });
    setSaving(true);
    try {
      await saveLoggedSession(queryClient, doc, (id) => {
        const meta = lookup(id);
        return ACTIVITY_LOG_EXERCISE_IDS.has(id) || (meta !== undefined && isCardioMeta(meta));
      });
      haptics.success();
      snackbar.show({
        message: `${activitySessionName(input)} logged`,
        tone: 'success',
      });
      onDone();
    } catch (error) {
      snackbar.show({ message: userFacingErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="gap-4" testID="log-activity-form">
      <FormField
        label="What did you do?"
        required
        {...(shown.activity && { error: shown.activity })}
      >
        <ChipGroup
          testID="log-activity-chips"
          options={ACTIVITY_OPTIONS}
          value={presetKey ? [presetKey] : []}
          onChange={(next) => setPresetKey(next[0])}
        />
      </FormField>

      {presetKey === 'other' ? (
        <FormField label="Activity name" required {...(shown.name && { error: shown.name })}>
          <Input
            testID="log-activity-name"
            accessibilityLabel="Activity name"
            aria-invalid={shown.name !== undefined}
            value={customName}
            onChangeText={(text) => setCustomName(text.slice(0, ACTIVITY_NAME_MAX_LENGTH))}
            placeholder="e.g. Rock climbing"
            returnKeyType="done"
          />
        </FormField>
      ) : null}

      <FormField label="How long?" required {...(shown.duration && { error: shown.duration })}>
        <View className="gap-2">
          <ChipGroup
            testID="log-activity-duration-chips"
            options={DURATION_OPTIONS}
            value={minutes !== undefined ? [minutes] : []}
            allowEmpty
            onChange={(next) => setMinutesText(next[0] !== undefined ? String(next[0]) : '')}
          />
          <View className="flex-row items-center gap-2">
            <Input
              testID="log-activity-duration"
              accessibilityLabel="Duration in minutes"
              aria-invalid={shown.duration !== undefined}
              keyboardType="number-pad"
              inputAccessoryViewID={barId}
              returnKeyType="done"
              value={minutesText}
              onChangeText={(text) => setMinutesText(digitsOnly(text, 3))}
              placeholder="Other"
              selectTextOnFocus
              className="w-24 text-center"
            />
            <Text variant="muted">{`min (up to ${ACTIVITY_MAX_DURATION_MIN})`}</Text>
          </View>
        </View>
      </FormField>

      <DateStepper
        testID="log-activity"
        localDate={date}
        minDate={activityMinDate(today)}
        today={today}
        onChangeDate={setDate}
      />
      {shown.date ? <Text className="text-xs text-red-600">{shown.date}</Text> : null}

      <FormField
        label="Calories burnt (optional)"
        hint="From your watch or the machine. It's only recorded — it never changes your food targets."
        {...(shown.calories && { error: shown.calories })}
      >
        <View className="flex-row items-center gap-2">
          <Input
            testID="log-activity-kcal"
            accessibilityLabel="Calories burnt, optional"
            aria-invalid={shown.calories !== undefined}
            keyboardType="number-pad"
            inputAccessoryViewID={barId}
            returnKeyType="done"
            value={kcalText}
            onChangeText={(text) => setKcalText(digitsOnly(text, 4))}
            placeholder="400"
            selectTextOnFocus
            className="w-28 text-center"
          />
          <Text variant="muted">{`kcal (up to ${ACTIVITY_MAX_KCAL})`}</Text>
        </View>
      </FormField>
      <NumericReturnBar
        nativeID={barId}
        testID="log-activity-numeric-bar"
        label="Done"
        onPress={() => Keyboard.dismiss()}
      />

      <FormField label="Effort (optional)" {...(shown.effort && { error: shown.effort })}>
        <EffortChips testID="log-activity-effort" value={effort} onChange={setEffort} />
      </FormField>

      <Button testID="log-activity-save" loading={saving} onPress={() => void onSave()}>
        Save activity
      </Button>
    </View>
  );
}

export function LogActivityAction({
  bootstrap,
  testID = 'gym-today-log-activity',
}: {
  bootstrap: GymBootstrap;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  // A fresh form every time the sheet opens: nothing from the last log lingers.
  const [openCount, setOpenCount] = useState(0);

  return (
    <>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={() => {
          setOpenCount((n) => n + 1);
          setOpen(true);
        }}
        className="min-h-11 justify-center"
      >
        <Text className="text-sm font-medium text-primary">Log an activity</Text>
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Log an activity"
        eyebrow="Done elsewhere"
        testID="log-activity-sheet"
      >
        <ActivityForm key={openCount} bootstrap={bootstrap} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
