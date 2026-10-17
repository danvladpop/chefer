import { useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, View, type TextInput } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { TRAINING_STYLE_LABEL, type DayKind, type WeightUnit } from '@chefer/types';
import {
  ChipGroup,
  EmptyState,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  NumericReturnBar,
  Screen,
  Sheet,
  Stepper,
  Text,
  useScrollFieldIntoView,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  formatLoadNumber,
  isSimpleTraining,
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
import { Icon } from '../../../components/icon';
import { NotificationsOffRow } from '../../../components/notifications-off-row';
import { useFlags } from '../../../hooks/use-flags';
import { trpc } from '../../../lib/trpc';
import {
  refreshNotificationPermission,
  useNotificationPermission,
} from '../../../lib/use-notification-permission';
import { GymFeedbackRow } from '../../feedback/gym-feedback-row';
import { SectionAnchor, useSectionTitle } from '../../settings/section-anchor';
import { TrainButton } from '../../shell/train/train-button';
import { GymBootstrapUnavailable, useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { OutboxWaitingCard } from '../components/outbox-waiting-card';
import { GymExportRow } from '../export/export-row';
import { localDate } from '../offline/ids';
import { outbox, useOutboxStatus } from '../offline/outbox';
import { ensureGymReminderPermission } from '../reminders/permission';
import { WEEKDAY_SHORT_LABELS, weekdayLabel } from '../routine/weekday';
import { myWeekSummaryOf } from '../simple/simple-helpers';
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

// 10 Oct redesign: the old shell's header draws Back like the shell top bar
// (a plain IconButton with the brand chevron) and the title as a title1.
function LegacyHeader({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <View className="min-h-11 flex-row items-center gap-1 px-4 pt-2">
      <IconButton
        testID="gym-settings-title-back"
        accessibilityLabel="Back"
        icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
        className="-ml-2"
      />
      <Text
        testID="gym-settings-title"
        accessibilityRole="header"
        numberOfLines={1}
        className="min-w-0 flex-1 text-title1 font-bold text-label"
      >
        {title}
      </Text>
    </View>
  );
}

/** A settings group's surface: the shell's card (hairline, one radius). */
function SettingsCard({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <View testID={testID} className="gap-4 rounded-card border border-separator bg-surface p-4">
      {children}
    </View>
  );
}

/** A control's name above it, inside a card. */
function FieldLabel({ children }: { children: string }) {
  return <Text className="text-callout font-semibold text-label">{children}</Text>;
}

/** One line of help under a control. */
function Hint({ children, testID }: { children: ReactNode; testID?: string }) {
  return (
    <Text testID={testID} className="text-caption text-label-secondary">
      {children}
    </Text>
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
    <Text
      accessibilityRole="header"
      className="px-4 text-subhead font-semibold text-label-secondary"
    >
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
  const colors = useThemeColors();
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
            className="min-h-11 flex-row items-center gap-1.5 rounded-full border border-separator bg-surface-sunken px-3 active:opacity-70"
          >
            <Text className="text-subhead text-label">
              {formatLoadNumber(kg, unit)} {unitLabel(unit)}
            </Text>
            <Icon name="close" color={colors.labelSecondary} size={16} />
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
        <TrainButton testID={`${testID}-add`} label="Add" variant="outline" onPress={add} />
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
  const flags = useFlags();
  const { cardioLogging } = flags;
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
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        {header ?? <LegacyHeader title="Gym settings" />}
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
      <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
        {header ?? <LegacyHeader title="Gym settings" />}
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
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      {header ?? <LegacyHeader title={title} />}

      <KeyboardAwareScrollView contentContainerClassName="gap-6 px-4 pb-8 pt-4">
        {full && flags.simpleTraining ? (
          // Simple training mode §6.5: the style switch (lossless), and My week
          // while it is "Keep it simple".
          <View className="gap-1.5" testID="gym-settings-style">
            <SectionTitle>Training style</SectionTitle>
            <SettingsCard>
              <ChipGroup
                testID="training-style-control"
                options={[
                  {
                    value: 'SIMPLE' as const,
                    label: TRAINING_STYLE_LABEL.SIMPLE,
                    testID: 'training-style-simple',
                  },
                  {
                    value: 'PROGRESSIVE' as const,
                    label: TRAINING_STYLE_LABEL.PROGRESSIVE,
                    testID: 'training-style-progressive',
                  },
                ]}
                value={[profile.trainingStyle ?? 'PROGRESSIVE']}
                onChange={(v) => {
                  const next = v[0];
                  if (next) saveMutation.mutate({ trainingStyle: next });
                }}
              />
              {isSimpleTraining(profile, flags) ? (
                <Pressable
                  testID="gym-settings-my-week"
                  accessibilityRole="link"
                  onPress={() => router.push('/gym/my-week')}
                  className="min-h-11 justify-center"
                >
                  <Text className="text-sm font-medium text-primary">My week</Text>
                  <Text variant="muted" className="text-xs">
                    {myWeekSummaryOf(bootstrap.activeRoutine)}
                  </Text>
                </Pressable>
              ) : null}
            </SettingsCard>
            <Text className="px-4 text-caption text-label-tertiary">
              Switch any time — your routine and history stay as they are.
            </Text>
          </View>
        ) : null}
        {full ? (
          <>
            <SectionAnchor id="units" className="gap-1.5">
              <SectionTitle>Units</SectionTitle>
              <SettingsCard>
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
              </SettingsCard>
              <Text className="px-4 text-caption text-label-tertiary">
                Also switches recipes, shopping lists and your body weight.
              </Text>
            </SectionAnchor>

            {cardioLogging ? (
              <View className="gap-1.5">
                <SectionTitle>Distance</SectionTitle>
                <SettingsCard>
                  <ChipGroup
                    testID="gym-settings-distance-unit"
                    options={[
                      {
                        value: 'KM' as const,
                        label: 'km',
                        testID: 'gym-settings-distance-unit-km',
                      },
                      {
                        value: 'MI' as const,
                        label: 'mi',
                        testID: 'gym-settings-distance-unit-mi',
                      },
                    ]}
                    value={[distanceUnit]}
                    onChange={(v) => {
                      const next = v[0];
                      if (next) saveMutation.mutate({ distanceUnit: next });
                    }}
                  />
                </SettingsCard>
              </View>
            ) : null}

            <View className="gap-1.5">
              <SectionTitle>Weekly goal</SectionTitle>
              <SettingsCard>
                <Stepper
                  testID="gym-settings-weekly-goal"
                  accessibilityLabel="Weekly goal"
                  value={profile.weeklyGoal}
                  min={1}
                  max={7}
                  label="sessions / week"
                  onChange={(n) => saveMutation.mutate({ weeklyGoal: n })}
                />
              </SettingsCard>
            </View>
          </>
        ) : null}

        {show('equipment') ? (
          <View className="gap-1.5">
            {full ? <SectionTitle>Equipment</SectionTitle> : null}
            <SettingsCard>
              <View className="gap-2">
                <FieldLabel>Bar weight</FieldLabel>
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
                <FieldLabel>Plate pairs you have</FieldLabel>
                <WeightListEditor
                  testID="gym-settings-plates"
                  valuesKg={profile.platePairsKg}
                  unit={unit}
                  onChangeKg={(kg) => saveMutation.mutate({ platePairsKg: kg })}
                />
              </View>
              <View className="gap-2">
                <FieldLabel>Dumbbells you have (weight of one dumbbell)</FieldLabel>
                <WeightListEditor
                  testID="gym-settings-dumbbells"
                  valuesKg={profile.dumbbellsKg}
                  unit={unit}
                  onChangeKg={(kg) => saveMutation.mutate({ dumbbellsKg: kg })}
                />
              </View>
              <View className="gap-2">
                <FieldLabel>Machine weight step</FieldLabel>
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
                <FieldLabel>Cable weight step</FieldLabel>
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
                <FieldLabel>Dip belt</FieldLabel>
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
                <FieldLabel>Micro plates</FieldLabel>
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
            </SettingsCard>
          </View>
        ) : null}

        {show('days') || show('reminders') || show('session') ? (
          <PartAnchor part={part} id="reminders" className="gap-1.5">
            {full ? <SectionTitle>Training days & reminders</SectionTitle> : null}
            <SettingsCard>
              {show('days') ? (
                <View className="gap-1.5">
                  <FieldLabel>Weekday kind</FieldLabel>
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
                          className="min-h-11 min-w-11 items-center justify-center gap-0.5 rounded-inner px-1 active:bg-surface-sunken disabled:opacity-60"
                        >
                          <Text className="text-caption font-semibold text-label">{label}</Text>
                          <Text
                            className={
                              kind
                                ? 'text-caption font-semibold text-brand'
                                : 'text-caption text-label-tertiary'
                            }
                          >
                            {kind ? DAY_KIND_SHORT[kind] : '—'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Hint>
                    Lift days come from your routine. Mark the rest as a run, a long run or rest.
                  </Hint>
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
                      <Text className="text-title3 font-semibold text-label">:</Text>
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
                    <FieldLabel>Nudge me if I’ve gone quiet for</FieldLabel>
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
                  <FieldLabel>How long can a session usually be?</FieldLabel>
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
            </SettingsCard>
          </PartAnchor>
        ) : null}

        {show('pause') ? (
          <PartAnchor part={part} id="pause" className="gap-1.5">
            {full ? <SectionTitle>Pause training</SectionTitle> : null}
            <SettingsCard>
              {shownPause ? (
                <View className="gap-3">
                  <Text testID="gym-settings-paused-note" className="text-callout text-label">
                    {pauseSummaryLine(shownPause, today)}
                  </Text>
                  <TrainButton
                    testID="gym-settings-pause-end"
                    label={activePause ? 'End pause now' : 'Cancel pause'}
                    variant="outline"
                    loading={pauseEndMutation.isPending}
                    onPress={() => pauseEndMutation.mutate({ id: shownPause.id })}
                  />
                </View>
              ) : isPausedThisWeek ? (
                <Text testID="gym-settings-paused-note" className="text-callout text-label">
                  Training is paused this week.
                </Text>
              ) : (
                <TrainButton
                  testID="gym-settings-pause-start"
                  label="Pause training"
                  variant="outline"
                  onPress={() => setPauseSheetVisible(true)}
                />
              )}
            </SettingsCard>
          </PartAnchor>
        ) : null}

        {full && outboxStatus.parked.length > 0 && (
          <View className="gap-1.5">
            <SectionTitle>Needs attention</SectionTitle>
            <View className="gap-2">
              {outboxStatus.parked.map((entry) => (
                <View
                  key={entry.doc.id}
                  testID={`gym-settings-parked-${entry.doc.id}`}
                  className="gap-2 rounded-card border border-separator bg-surface p-4"
                >
                  <Text className="text-body font-semibold text-label">{entry.doc.name}</Text>
                  <Text className="text-caption text-label-secondary">
                    {entry.doc.localDate} · {entry.parkedReason ?? entry.lastError ?? 'Rejected'}
                  </Text>
                  {confirmingDiscardId === entry.doc.id ? (
                    <View className="gap-2">
                      <Text className="text-subhead text-danger">This workout will be lost.</Text>
                      <View className="flex-row gap-2">
                        <TrainButton
                          testID={`gym-settings-parked-${entry.doc.id}-discard-confirm`}
                          label="Discard"
                          variant="danger"
                          onPress={() => discardParked(entry.doc.id)}
                        />
                        <TrainButton
                          testID={`gym-settings-parked-${entry.doc.id}-discard-cancel`}
                          label="Cancel"
                          variant="outline"
                          onPress={() => setConfirmingDiscardId(null)}
                        />
                      </View>
                    </View>
                  ) : (
                    <View className="flex-row gap-2">
                      <TrainButton
                        testID={`gym-settings-parked-${entry.doc.id}-retry`}
                        label="Retry"
                        onPress={() => retryParked(entry.doc.id)}
                      />
                      <TrainButton
                        testID={`gym-settings-parked-${entry.doc.id}-discard`}
                        label="Discard"
                        variant="outline"
                        onPress={() => setConfirmingDiscardId(entry.doc.id)}
                      />
                    </View>
                  )}
                </View>
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
              <Text testID="gym-settings-last-sync" className="px-4 text-callout text-label">
                {outboxStatus.lastSyncAt
                  ? new Date(outboxStatus.lastSyncAt).toLocaleString()
                  : 'Never'}
              </Text>
            </View>

            {/* Advisory disclaimer (2026-10-02), always visible on gym settings. */}
            <Text
              testID="gym-settings-advisory-disclaimer"
              className="text-center text-caption text-label-tertiary"
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
          <TrainButton
            testID="gym-settings-pause-confirm"
            label="Pause"
            size="lg"
            loading={pauseCreateMutation.isPending}
            onPress={confirmPause}
          />
        }
      >
        <Text testID="gym-settings-pause-explainer" className="text-subhead text-label-secondary">
          {PAUSE_EXPLAINER}
        </Text>
        <View className="gap-2">
          <FieldLabel>Starting</FieldLabel>
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
          <FieldLabel>How many weeks?</FieldLabel>
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
          <FieldLabel>Reason (optional)</FieldLabel>
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
        <Text testID="gym-settings-pause-range" className="text-callout font-semibold text-label">
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
            className="min-h-11 justify-center border-b border-separator py-3 active:opacity-70"
          >
            <Text className="text-body text-label">{opt.label}</Text>
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
          className="min-h-11 justify-center py-3 active:opacity-70"
        >
          <Text className="text-body text-label-secondary">Clear</Text>
        </Pressable>
      </Sheet>
    </Screen>
  );
}
