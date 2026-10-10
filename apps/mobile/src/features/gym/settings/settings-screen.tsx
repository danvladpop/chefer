import { useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { DayKind, WeightUnit } from '@chefer/types';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  Input,
  KeyboardAwareScrollView,
  NumericReturnBar,
  Screen,
  Sheet,
  Stepper,
  Text,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import {
  formatLoadNumber,
  kgToUnit,
  PAUSE_EXPLAINER,
  PAUSE_START_CHOICES,
  pauseEndDate,
  pauseStartDate,
  pauseSummaryLine,
  SESSION_LENGTH_OPTIONS,
  unitLabel,
  unitToKg,
  weekdayDateLabel,
  weekStartOf,
  WELLNESS_COPY,
  type PauseStartChoice,
} from '@chefer/utils';
import { NotificationsOffRow } from '../../../components/notifications-off-row';
import { useFlags } from '../../../hooks/use-flags';
import { trpc } from '../../../lib/trpc';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../../lib/use-notification-permission';
import { GymFeedbackRow } from '../../feedback/gym-feedback-row';
import { SectionAnchor, useSectionTitle } from '../../settings/section-anchor';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { OutboxWaitingCard } from '../components/outbox-waiting-card';
import { GymExportRow } from '../export/export-row';
import { localDate } from '../offline/ids';
import { outbox, useOutboxStatus } from '../offline/outbox';
import { ensureGymReminderPermission } from '../reminders/permission';
import { WEEKDAY_SHORT_LABELS, weekdayLabel } from '../routine/weekday';
import { gymBootstrapQueryKey, useGymBootstrap } from '../use-gym-bootstrap';
import { useSaveGymProfile } from '../use-save-gym-profile';

// T-06.9: the weekday-kind row's picker options (`lift` is routine-derived,
// never user-settable — see `training-days.service.ts`).
const DAY_KIND_OPTIONS: { value: Exclude<DayKind, 'lift'>; label: string; testID: string }[] = [
  { value: 'run', label: 'Run', testID: 'run' },
  { value: 'long_run', label: 'Long run', testID: 'long-run' },
  { value: 'rest', label: 'Rest', testID: 'rest' },
];
const DAY_KIND_SHORT: Record<DayKind, string> = {
  lift: 'Lift',
  run: 'Run',
  long_run: 'Long',
  rest: 'Rest',
};

// Gym settings (gym_plan.md §1.3 "Settings"). Every control saves immediately
// through gym.profile.save — no separate "Save changes" step, matching a
// typical mobile settings screen. See the KNOWN GAP note above `PauseSection`
// for the one control this screen intentionally does not wire up.

const PAUSE_REASONS = [
  { value: 'vacation' as const, label: 'Vacation' },
  { value: 'illness' as const, label: 'Illness' },
  { value: 'injury' as const, label: 'Injury' },
  { value: 'other' as const, label: 'Other' },
];

// T-36.2 (bug B-40): "Nudge me if I've gone quiet for" — a reachable, ≤ 3-tap
// control for GymProfile.quietNudgeDays (null = never).
type QuietNudgeChip = '3' | '5' | '7' | 'never';
const QUIET_NUDGE_DAYS: Record<QuietNudgeChip, number | null> = {
  '3': 3,
  '5': 5,
  '7': 7,
  never: null,
};
const QUIET_NUDGE_OPTIONS: { value: QuietNudgeChip; label: string; testID: string }[] = [
  { value: '3', label: '3 days', testID: 'gym-settings-quiet-nudge-3' },
  { value: '5', label: '5 days', testID: 'gym-settings-quiet-nudge-5' },
  { value: '7', label: 'A week', testID: 'gym-settings-quiet-nudge-7' },
  { value: 'never', label: 'Never', testID: 'gym-settings-quiet-nudge-never' },
];
function quietNudgeChipValue(days: number | null): QuietNudgeChip {
  if (days === 3) return '3';
  if (days === 7) return '7';
  if (days === null) return 'never';
  return '5'; // default bucket for 5 or any other stored value
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function BackButton() {
  return (
    <Pressable
      testID="gym-settings-title-back"
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
      className="h-11 w-11 items-center justify-center rounded-full bg-gray-100"
    >
      <Ionicons name="chevron-back" size={22} color="#374151" />
    </Pressable>
  );
}

/**
 * 10 Oct redesign: the new shell's Training settings (`features/shell/train`)
 * opens ONE part of this screen at a time, as a pushed page with its own top
 * bar. Without a `part` (the old shell) the whole screen renders as before.
 */
export type GymSettingsPart = 'equipment' | 'days' | 'reminders' | 'session' | 'pause' | 'export';

export interface GymSettingsScreenProps {
  /** Render only this part (new shell). Omitted: the full legacy screen. */
  part?: GymSettingsPart;
  /** Replaces the legacy back + title row (new shell's top bar). */
  header?: ReactNode;
}

/** A `SectionAnchor` on the full screen; a plain wrapper when one part is shown alone. */
function PartAnchor({
  part,
  id,
  className,
  children,
}: {
  part: GymSettingsPart | undefined;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  if (part) return <View className={className}>{children}</View>;
  return (
    <SectionAnchor id={id} className={className}>
      {children}
    </SectionAnchor>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
      {children}
    </Text>
  );
}

function WeightListEditor({
  testID,
  valuesKg,
  unit,
  onChangeKg,
}: {
  testID: string;
  valuesKg: number[];
  unit: WeightUnit;
  onChangeKg: (kg: number[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const sorted = [...valuesKg].sort((a, b) => a - b);
  const inputRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  // iOS's decimal-pad has no Return key of its own — this bar is its
  // "Done" substitute (dogfood #2). Only one field per editor, so unlike the
  // setup wizard's weights list there's no "Next" to chain to.
  const accessoryID = `${testID}-return`;

  const add = () => {
    const n = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) {
      onChangeKg([...valuesKg, unitToKg(n, unit)]);
      setDraft('');
    }
  };
  const submit = () => {
    add();
    Keyboard.dismiss();
  };

  return (
    <View className="gap-2">
      <View testID={testID} className="flex-row flex-wrap gap-2">
        {sorted.map((kg, i) => (
          <Pressable
            key={`${kg}-${i}`}
            testID={`${testID}-item-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${formatLoadNumber(kg, unit)} ${unitLabel(unit)}`}
            onPress={() => onChangeKg(valuesKg.filter((v) => v !== kg))}
            className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-border bg-background px-3"
          >
            <Text className="text-sm">
              {formatLoadNumber(kg, unit)} {unitLabel(unit)}
            </Text>
            <Text className="text-xs text-muted-foreground">✕</Text>
          </Pressable>
        ))}
      </View>
      <View className="flex-row items-center gap-2">
        <Input
          ref={inputRef}
          testID={`${testID}-add-input`}
          keyboardType="decimal-pad"
          inputAccessoryViewID={Platform.OS === 'ios' ? accessoryID : undefined}
          placeholder={`Add (${unitLabel(unit)})`}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => scrollFieldIntoView(inputRef.current)}
          returnKeyType="done"
          onSubmitEditing={submit}
          className="w-28"
        />
        <Button testID={`${testID}-add`} size="sm" variant="outline" onPress={add}>
          Add
        </Button>
      </View>
      <NumericReturnBar
        nativeID={accessoryID}
        label="Done"
        onPress={submit}
        testID={`${accessoryID}-bar`}
      />
    </View>
  );
}

export function GymSettingsScreen({ part, header }: GymSettingsScreenProps = {}) {
  const full = part === undefined;
  const show = (p: GymSettingsPart) => full || part === p;
  // UX-ACC-04: opened from a Settings row (`?section=`), the title is the row's.
  const title = useSectionTitle('Gym settings');
  const queryClient = useQueryClient();
  const bootstrapQuery = useGymBootstrap();
  const { data: bootstrap } = bootstrapQuery;
  const bootstrapLoad = useGymBootstrapLoad(bootstrapQuery);
  const { cardioLogging } = useFlags();
  const outboxStatus = useOutboxStatus();
  const [pauseSheetVisible, setPauseSheetVisible] = useState(false);
  const [pauseWeeks, setPauseWeeks] = useState(1);
  const [pauseStart, setPauseStart] = useState<PauseStartChoice>('today');
  const [pauseReason, setPauseReason] = useState<(typeof PAUSE_REASONS)[number]['value'] | null>(
    null,
  );
  const [confirmingDiscardId, setConfirmingDiscardId] = useState<string | null>(null);
  const [kindSheetWeekday, setKindSheetWeekday] = useState<number | null>(null);
  // UX-GYM-04: what the OS says about notifications, so "On" is never shown
  // while nothing can fire. `reminderBlocked` remembers a just-refused ask.
  const notificationPermission = useNotificationPermission();
  const [reminderBlocked, setReminderBlocked] = useState(false);
  // Hooks run unconditionally (before the "no profile yet" early return), so
  // these read the reminder time via optional chaining rather than after a
  // `bootstrap.profile` guard.
  const [reminderHour, setReminderHour] = useState(() =>
    bootstrap?.profile?.reminderTime ? Number(bootstrap.profile.reminderTime.split(':')[0]) : 7,
  );
  const [reminderMinute, setReminderMinute] = useState(() =>
    bootstrap?.profile?.reminderTime ? Number(bootstrap.profile.reminderTime.split(':')[1]) : 0,
  );

  const utils = trpc.useUtils();
  // UX-GYM-22: optimistic with rollback; a failure shows the default snackbar.
  const saveMutation = useSaveGymProfile();
  const pauseCreateMutation = trpc.gym.pause.create.useMutation({
    onSuccess: () => {
      setPauseSheetVisible(false);
      void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
    },
  });
  const pauseEndMutation = trpc.gym.pause.end.useMutation({
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey }),
  });
  // T-06.9: weekday kinds (lift days come from the routine, never from here).
  const dayKindsQuery = trpc.training.getDayKinds.useQuery();
  const setDayKindsMutation = trpc.training.setDayKinds.useMutation({
    onSuccess: (data) => utils.training.getDayKinds.setData(undefined, data),
  });

  if (bootstrapLoad.load !== 'data') {
    // UX-GYM-24: a failed or offline first load is not "set up your training".
    return (
      <Screen
        className={full ? 'px-0' : 'bg-canvas px-0'}
        edges={['top', 'bottom', 'left', 'right']}
      >
        {header ?? (
          <View className="flex-row items-center gap-3 px-4 pt-2">
            <BackButton />
            <Text testID="gym-settings-title" variant="title">
              Gym settings
            </Text>
          </View>
        )}
        <GymBootstrapUnavailable
          load={bootstrapLoad.load}
          onRetry={bootstrapLoad.retry}
          testID="gym-settings"
          what="your gym settings"
        />
      </Screen>
    );
  }

  if (!bootstrap?.profile) {
    return (
      <Screen
        className={full ? 'px-0' : 'bg-canvas px-0'}
        edges={['top', 'bottom', 'left', 'right']}
      >
        {header ?? (
          <View className="flex-row items-center gap-3 px-4 pt-2">
            <BackButton />
            <Text testID="gym-settings-title" variant="title">
              Gym settings
            </Text>
          </View>
        )}
        <EmptyState
          testID="gym-settings-empty"
          title="Set up your training first"
          description="Gym settings appear once you've completed setup."
        />
      </Screen>
    );
  }

  const { profile } = bootstrap;
  const unit = profile.unit;
  // T-42.3 (S21, Δ2.2): null/absent derives from `unit` — MI when LB, else KM.
  const distanceUnit = profile.distanceUnit ?? (unit === 'LB' ? 'MI' : 'KM');
  const today = localDate();
  const isPausedThisWeek = bootstrap.weeks.some(
    (w) => w.weekStart === weekStartOf(today) && w.status === 'paused',
  );
  const activePause = bootstrap.activePause;
  // UX-GYM-16: a pause that starts later (tomorrow / next Monday) is shown — and can be
  // cancelled — here too, so the user never sees "Pause training" while one is booked.
  const shownPause = activePause ?? bootstrap.upcomingPause ?? null;
  // T-06.9: a weekday with a planned routine day is always `lift`, read-only
  // here — the routine editor is the only place that changes it.
  const liftWeekdays = new Set(
    (bootstrap.activeRoutine?.days ?? [])
      .map((d) => d.plannedWeekday)
      .filter((w): w is number => w !== null),
  );
  const dayKinds = dayKindsQuery.data ?? {};
  // The OS answer beats the saved preference: denied means reminders are Off.
  const remindersDenied = notificationPermission === 'denied';
  const remindersOn = profile.reminderEnabled && !remindersDenied;
  // `reminderBlocked` covers the moment right after a refused prompt, before the
  // OS answer is re-read; a later grant (back from Settings) clears the row.
  const showNotificationsOff =
    notificationPermission !== 'granted' &&
    (reminderBlocked || (remindersDenied && profile.reminderEnabled));

  const saveReminder = (enabled: boolean, hour: number, minute: number) => {
    const save = (on: boolean) =>
      saveMutation.mutate({
        reminderEnabled: on,
        reminderTime: on ? `${pad(hour)}:${pad(minute)}` : null,
      });
    if (!enabled) {
      setReminderBlocked(false);
      save(false);
      return;
    }
    // Ask for notification permission right here — a direct user action on
    // the toggle — never on cold start (gym_plan.md §6.5). UX-GYM-04: wait for
    // the answer; on a refusal the switch goes Off and the row below points to
    // Settings, instead of saving "On" for reminders that can never fire.
    void ensureGymReminderPermission().then((granted) => {
      refreshNotificationPermission();
      setReminderBlocked(!granted);
      // Refused while it was already off: nothing to change on the server.
      if (granted || profile.reminderEnabled) save(granted);
    });
  };

  const confirmPause = () => {
    const startDate = pauseStartDate(pauseStart, today);
    const endDate = pauseEndDate(startDate, pauseWeeks);
    pauseCreateMutation.mutate({ startDate, endDate, reason: pauseReason });
  };

  const retryParked = (id: string) => void outbox.retryParked(id);
  const discardParked = (id: string) => {
    outbox.discardParked(id);
    setConfirmingDiscardId(null);
  };

  return (
    <Screen className={full ? 'px-0' : 'bg-canvas px-0'} edges={['top', 'bottom', 'left', 'right']}>
      {header ?? (
        <View className="flex-row items-center gap-3 px-4 pt-2">
          <BackButton />
          <Text testID="gym-settings-title" variant="title">
            {title}
          </Text>
        </View>
      )}

      <KeyboardAwareScrollView contentContainerClassName="gap-5 px-4 py-4">
        {full ? (
          <>
            <SectionAnchor id="units" className="gap-2">
              <SectionTitle>Units</SectionTitle>
              <ChipGroup
                testID="gym-settings-unit"
                options={[
                  { value: 'KG' as const, label: 'kg', testID: 'gym-settings-unit-kg' },
                  { value: 'LB' as const, label: 'lb', testID: 'gym-settings-unit-lb' },
                ]}
                value={[unit]}
                onChange={(v) => {
                  const next = v[0];
                  if (next) saveMutation.mutate({ unit: next });
                }}
              />
              <Text variant="muted" className="text-xs">
                Also switches recipes, shopping lists and your body weight.
              </Text>
            </SectionAnchor>

            {cardioLogging ? (
              <View className="gap-2">
                <SectionTitle>Distance</SectionTitle>
                <ChipGroup
                  testID="gym-settings-distance-unit"
                  options={[
                    { value: 'KM' as const, label: 'km', testID: 'gym-settings-distance-unit-km' },
                    { value: 'MI' as const, label: 'mi', testID: 'gym-settings-distance-unit-mi' },
                  ]}
                  value={[distanceUnit]}
                  onChange={(v) => {
                    const next = v[0];
                    if (next) saveMutation.mutate({ distanceUnit: next });
                  }}
                />
              </View>
            ) : null}

            <View className="gap-2">
              <SectionTitle>Weekly goal</SectionTitle>
              <Stepper
                testID="gym-settings-weekly-goal"
                accessibilityLabel="Weekly goal"
                value={profile.weeklyGoal}
                min={1}
                max={7}
                label="sessions / week"
                onChange={(n) => saveMutation.mutate({ weeklyGoal: n })}
              />
            </View>
          </>
        ) : null}

        {show('equipment') ? (
          <View className="gap-3">
            {full ? <SectionTitle>Equipment</SectionTitle> : null}
            <Card className="gap-4">
              <View className="gap-2">
                <Text variant="label">Bar weight</Text>
                <Stepper
                  testID="gym-settings-bar-weight"
                  accessibilityLabel="Bar weight"
                  value={kgToUnit(profile.barWeightKg, unit)}
                  step={unit === 'KG' ? 0.5 : 1}
                  min={0}
                  max={60}
                  format={(v) => `${formatLoadNumber(unitToKg(v, unit), unit)} ${unitLabel(unit)}`}
                  onChange={(v) => saveMutation.mutate({ barWeightKg: unitToKg(v, unit) })}
                />
              </View>
              <View className="gap-2">
                <Text variant="label">Plate pairs you have</Text>
                <WeightListEditor
                  testID="gym-settings-plates"
                  valuesKg={profile.platePairsKg}
                  unit={unit}
                  onChangeKg={(kg) => saveMutation.mutate({ platePairsKg: kg })}
                />
              </View>
              <View className="gap-2">
                <Text variant="label">Dumbbells you have (weight of one dumbbell)</Text>
                <WeightListEditor
                  testID="gym-settings-dumbbells"
                  valuesKg={profile.dumbbellsKg}
                  unit={unit}
                  onChangeKg={(kg) => saveMutation.mutate({ dumbbellsKg: kg })}
                />
              </View>
              <View className="gap-2">
                <Text variant="label">Machine weight step</Text>
                <Stepper
                  testID="gym-settings-machine-step"
                  accessibilityLabel="Machine weight step"
                  value={kgToUnit(profile.machineStepKg, unit)}
                  step={unit === 'KG' ? 0.5 : 1}
                  min={0.5}
                  max={20}
                  format={(v) => `${formatLoadNumber(unitToKg(v, unit), unit)} ${unitLabel(unit)}`}
                  onChange={(v) => saveMutation.mutate({ machineStepKg: unitToKg(v, unit) })}
                />
              </View>
              <View className="gap-2">
                <Text variant="label">Cable weight step</Text>
                <Stepper
                  testID="gym-settings-cable-step"
                  accessibilityLabel="Cable weight step"
                  value={kgToUnit(profile.cableStepKg, unit)}
                  step={unit === 'KG' ? 0.5 : 1}
                  min={0.5}
                  max={20}
                  format={(v) => `${formatLoadNumber(unitToKg(v, unit), unit)} ${unitLabel(unit)}`}
                  onChange={(v) => saveMutation.mutate({ cableStepKg: unitToKg(v, unit) })}
                />
              </View>
              <View className="gap-2">
                <Text variant="label">Dip belt</Text>
                <ChipGroup
                  testID="gym-settings-dip-belt"
                  options={[
                    { value: 'no' as const, label: 'No', testID: 'gym-settings-dip-belt-no' },
                    { value: 'yes' as const, label: 'Yes', testID: 'gym-settings-dip-belt-yes' },
                  ]}
                  value={[profile.hasDipBelt ? 'yes' : 'no']}
                  onChange={(v) => saveMutation.mutate({ hasDipBelt: v[0] === 'yes' })}
                />
              </View>
              <View className="gap-2">
                <Text variant="label">Micro plates</Text>
                <ChipGroup
                  testID="gym-settings-micro-plates"
                  options={[
                    { value: 'no' as const, label: 'No', testID: 'gym-settings-micro-plates-no' },
                    {
                      value: 'yes' as const,
                      label: 'Yes',
                      testID: 'gym-settings-micro-plates-yes',
                    },
                  ]}
                  value={[profile.microPlates ? 'yes' : 'no']}
                  onChange={(v) => saveMutation.mutate({ microPlates: v[0] === 'yes' })}
                />
              </View>
            </Card>
          </View>
        ) : null}

        {show('days') || show('reminders') || show('session') ? (
          <PartAnchor part={part} id="reminders" className="gap-2">
            {full ? <SectionTitle>Training days & reminders</SectionTitle> : null}
            <Card className="gap-3">
              {show('days') ? (
                <View className="gap-1.5">
                  <Text variant="label">Weekday kind</Text>
                  <View className="flex-row justify-between" testID="gym-settings-day-kinds">
                    {WEEKDAY_SHORT_LABELS.map((label, weekday) => {
                      const isLift = liftWeekdays.has(weekday);
                      const kind: DayKind | null = isLift
                        ? 'lift'
                        : (dayKinds[String(weekday)] ?? null);
                      return (
                        <Pressable
                          key={weekday}
                          testID={`gym-settings-day-kind-${weekday}`}
                          accessibilityRole="button"
                          accessibilityLabel={`${weekdayLabel(weekday)}: ${kind ? DAY_KIND_SHORT[kind] : 'not set'}`}
                          disabled={isLift}
                          onPress={() => setKindSheetWeekday(weekday)}
                          className="min-h-11 min-w-11 items-center justify-center gap-0.5 rounded-lg px-1 disabled:opacity-60"
                        >
                          <Text className="text-xs font-semibold">{label}</Text>
                          <Text variant="muted" className="text-xs">
                            {kind ? DAY_KIND_SHORT[kind] : '—'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text variant="muted" className="text-xs">
                    Lift days come from your routine. Mark the rest as a run, a long run or rest.
                  </Text>
                </View>
              ) : null}
              {show('reminders') ? (
                <>
                  <ChipGroup
                    testID="gym-settings-reminder-toggle"
                    options={[
                      { value: 'off' as const, label: 'Off', testID: 'gym-settings-reminder-off' },
                      { value: 'on' as const, label: 'On', testID: 'gym-settings-reminder-on' },
                    ]}
                    value={[remindersOn ? 'on' : 'off']}
                    onChange={(v) => saveReminder(v[0] === 'on', reminderHour, reminderMinute)}
                  />
                  {showNotificationsOff && (
                    <NotificationsOffRow
                      testID="gym-settings-notifications-off"
                      message="Reminders are off for Chefer"
                    />
                  )}
                  {remindersOn && (
                    <View className="flex-row items-center gap-3">
                      <Stepper
                        testID="gym-settings-reminder-hour"
                        accessibilityLabel="Reminder hour"
                        value={reminderHour}
                        min={0}
                        max={23}
                        format={(v) => pad(v)}
                        onChange={(v) => {
                          setReminderHour(v);
                          saveReminder(true, v, reminderMinute);
                        }}
                      />
                      <Text className="text-lg font-semibold">:</Text>
                      <Stepper
                        testID="gym-settings-reminder-minute"
                        accessibilityLabel="Reminder minute"
                        value={reminderMinute}
                        step={15}
                        min={0}
                        max={45}
                        format={(v) => pad(v)}
                        onChange={(v) => {
                          setReminderMinute(v);
                          saveReminder(true, reminderHour, v);
                        }}
                      />
                    </View>
                  )}
                  <View className="gap-1.5">
                    <Text variant="label">Nudge me if I’ve gone quiet for</Text>
                    <ChipGroup
                      testID="gym-settings-quiet-nudge"
                      options={QUIET_NUDGE_OPTIONS}
                      value={[quietNudgeChipValue(profile.quietNudgeDays)]}
                      onChange={(v) => {
                        const chip = v[0] ?? 'never';
                        saveMutation.mutate({ quietNudgeDays: QUIET_NUDGE_DAYS[chip] });
                      }}
                    />
                  </View>
                </>
              ) : null}
              {show('session') ? (
                <View className="gap-1.5">
                  <Text variant="label">How long can a session usually be?</Text>
                  <ChipGroup
                    testID="gym-settings-session-length"
                    allowEmpty
                    options={SESSION_LENGTH_OPTIONS.map((n) => ({
                      value: n,
                      label: n === 75 ? '75+ min' : `${String(n)} min`,
                      testID: `gym-settings-session-length-${String(n)}`,
                    }))}
                    value={profile.sessionLengthMins ? [profile.sessionLengthMins] : []}
                    onChange={(v) => saveMutation.mutate({ sessionLengthMins: v[0] ?? null })}
                  />
                </View>
              ) : null}
            </Card>
          </PartAnchor>
        ) : null}

        {show('pause') ? (
          <PartAnchor part={part} id="pause" className="gap-2">
            {full ? <SectionTitle>Pause training</SectionTitle> : null}
            <Card className="gap-2">
              {shownPause ? (
                <View className="gap-2">
                  <Text testID="gym-settings-paused-note" variant="muted">
                    {pauseSummaryLine(shownPause, today)}
                  </Text>
                  <Button
                    testID="gym-settings-pause-end"
                    variant="outline"
                    loading={pauseEndMutation.isPending}
                    onPress={() => pauseEndMutation.mutate({ id: shownPause.id })}
                  >
                    {activePause ? 'End pause now' : 'Cancel pause'}
                  </Button>
                </View>
              ) : isPausedThisWeek ? (
                <Text testID="gym-settings-paused-note" variant="muted">
                  Training is paused this week.
                </Text>
              ) : (
                <Button
                  testID="gym-settings-pause-start"
                  variant="outline"
                  onPress={() => setPauseSheetVisible(true)}
                >
                  Pause training
                </Button>
              )}
            </Card>
          </PartAnchor>
        ) : null}

        {full && outboxStatus.parked.length > 0 && (
          <View className="gap-2">
            <SectionTitle>Needs attention</SectionTitle>
            <View className="gap-2">
              {outboxStatus.parked.map((entry) => (
                <Card
                  key={entry.doc.id}
                  testID={`gym-settings-parked-${entry.doc.id}`}
                  className="gap-2"
                >
                  <Text className="font-medium">{entry.doc.name}</Text>
                  <Text variant="muted" className="text-xs">
                    {entry.doc.localDate} · {entry.parkedReason ?? entry.lastError ?? 'Rejected'}
                  </Text>
                  {confirmingDiscardId === entry.doc.id ? (
                    <View className="gap-2">
                      <Text className="text-sm text-red-600">This workout will be lost.</Text>
                      <View className="flex-row gap-2">
                        <Button
                          testID={`gym-settings-parked-${entry.doc.id}-discard-confirm`}
                          size="sm"
                          variant="destructive"
                          onPress={() => discardParked(entry.doc.id)}
                        >
                          Discard
                        </Button>
                        <Button
                          testID={`gym-settings-parked-${entry.doc.id}-discard-cancel`}
                          size="sm"
                          variant="outline"
                          onPress={() => setConfirmingDiscardId(null)}
                        >
                          Cancel
                        </Button>
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row gap-2">
                      <Button
                        testID={`gym-settings-parked-${entry.doc.id}-retry`}
                        size="sm"
                        onPress={() => retryParked(entry.doc.id)}
                      >
                        Retry
                      </Button>
                      <Button
                        testID={`gym-settings-parked-${entry.doc.id}-discard`}
                        size="sm"
                        variant="outline"
                        onPress={() => setConfirmingDiscardId(entry.doc.id)}
                      >
                        Discard
                      </Button>
                    </View>
                  )}
                </Card>
              ))}
            </View>
          </View>
        )}

        {show('export') ? (
          <PartAnchor part={part} id="export">
            <GymExportRow />
          </PartAnchor>
        ) : null}

        {full ? (
          <>
            <GymFeedbackRow />

            <OutboxWaitingCard status={outboxStatus} testID="gym-settings-outbox" />

            <View className="gap-1">
              <SectionTitle>Last sync</SectionTitle>
              <Text testID="gym-settings-last-sync" variant="muted">
                {outboxStatus.lastSyncAt
                  ? new Date(outboxStatus.lastSyncAt).toLocaleString()
                  : 'Never'}
              </Text>
            </View>

            {/* Advisory disclaimer (2026-10-02), always visible on gym settings. */}
            <Text
              testID="gym-settings-advisory-disclaimer"
              variant="muted"
              className="text-center text-xs"
            >
              {WELLNESS_COPY.gymAdvisoryDisclaimer}
            </Text>
          </>
        ) : null}
      </KeyboardAwareScrollView>

      <Sheet
        visible={pauseSheetVisible}
        onClose={() => setPauseSheetVisible(false)}
        title="Pause training"
        testID="gym-settings-pause-sheet"
        footer={
          <Button
            testID="gym-settings-pause-confirm"
            loading={pauseCreateMutation.isPending}
            onPress={confirmPause}
          >
            Pause
          </Button>
        }
      >
        <Text testID="gym-settings-pause-explainer" variant="muted">
          {PAUSE_EXPLAINER}
        </Text>
        <View className="gap-2">
          <Text variant="label">Starting</Text>
          <ChipGroup
            testID="gym-settings-pause-starting"
            options={PAUSE_START_CHOICES.map((c) => ({
              ...c,
              testID: `gym-settings-pause-starting-${c.value}`,
            }))}
            value={[pauseStart]}
            onChange={(v) => setPauseStart(v[0] ?? 'today')}
          />
        </View>
        <View className="gap-2">
          <Text variant="label">How many weeks?</Text>
          <Stepper
            testID="gym-settings-pause-weeks"
            accessibilityLabel="Pause weeks"
            value={pauseWeeks}
            min={1}
            max={4}
            label="weeks"
            onChange={setPauseWeeks}
          />
        </View>
        <View className="gap-2">
          <Text variant="label">Reason (optional)</Text>
          <ChipGroup
            testID="gym-settings-pause-reason"
            options={PAUSE_REASONS.map((r) => ({
              ...r,
              testID: `gym-settings-pause-reason-${r.value}`,
            }))}
            value={pauseReason ? [pauseReason] : []}
            allowEmpty
            onChange={(v) => setPauseReason(v[0] ?? null)}
          />
        </View>
        <Text testID="gym-settings-pause-range" className="text-sm font-medium">
          {`${weekdayDateLabel(pauseStartDate(pauseStart, today))} – ${weekdayDateLabel(pauseEndDate(pauseStartDate(pauseStart, today), pauseWeeks))}`}
        </Text>
      </Sheet>

      <Sheet
        visible={kindSheetWeekday !== null}
        onClose={() => setKindSheetWeekday(null)}
        title={kindSheetWeekday !== null ? weekdayLabel(kindSheetWeekday) : ''}
        testID="gym-settings-day-kind-sheet"
      >
        {DAY_KIND_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            testID={`gym-settings-day-kind-sheet-${opt.testID}`}
            accessibilityRole="button"
            onPress={() => {
              if (kindSheetWeekday === null) return;
              setDayKindsMutation.mutate({ days: { [String(kindSheetWeekday)]: opt.value } });
              setKindSheetWeekday(null);
            }}
            className="min-h-11 justify-center border-b border-border py-3"
          >
            <Text className="font-medium">{opt.label}</Text>
          </Pressable>
        ))}
        <Pressable
          testID="gym-settings-day-kind-sheet-clear"
          accessibilityRole="button"
          onPress={() => {
            if (kindSheetWeekday === null) return;
            setDayKindsMutation.mutate({ days: { [String(kindSheetWeekday)]: null } });
            setKindSheetWeekday(null);
          }}
          className="min-h-11 justify-center py-3"
        >
          <Text className="font-medium text-muted-foreground">Clear</Text>
        </Pressable>
      </Sheet>
    </Screen>
  );
}
