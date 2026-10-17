import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type {
  GymBootstrap,
  GymEquipmentAccess,
  GymSplitPreference,
  TrainingExperience,
  VolumeGroup,
  WeightUnit,
} from '@chefer/types';
import {
  ChipGroup,
  ConfirmSheet,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  NumericReturnBar,
  Screen,
  Sheet,
  Stepper,
  Text,
  useFieldChain,
  useScrollFieldIntoView,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  cn,
  SESSION_LENGTH_OPTIONS,
  unitLabel,
  unitToKg,
  VOLUME_GROUP_LABELS,
  weightUnitForSystem,
  WELLNESS_COPY,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { NotificationsOffRow } from '../../../components/notifications-off-row';
import { trpc } from '../../../lib/trpc';
import { refreshNotificationPermission } from '../../../lib/use-notification-permission';
import { useUnsavedGuard } from '../../../lib/use-unsaved-guard';
import { useShellV2 } from '../../shell/shell-store';
import { ProgramStep } from '../../shell/train/program-step';
import { TrainButton } from '../../shell/train/train-button';
import { captureGymEvent } from '../analytics';
import { ExerciseNameLink } from '../components/exercise-name-link';
import { exerciseCoverUrl, libraryImages } from '../library/exercise-image';
import { ensureGymReminderPermission } from '../reminders/permission';
import { gymBootstrapQueryKey } from '../use-gym-bootstrap';
import { gymErrorMessage, startingWeightError } from '../validation-copy';
import { defaultUnitFromLocale } from './locale-unit';
import {
  buildTemplatePreview,
  knownWeightExercisesOf,
  type TemplatePreview,
} from './template-preview';

// Gym setup (gym_plan.md §1.3 "Setup", programming-research §3.5). A 7-step
// stepper with progress dots ending in `profile.completeSetup`. The preview
// (step 5) uses profile.recommend for the recommendation + alternatives list
// (also the "needs a connection" gate), then renders day-by-day content with
// the pure, shared engine (template-preview.ts) so switching between
// alternatives never needs another round trip.

const TOTAL_STEPS = 7;
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/**
 * One accessory bar PER weight field (audit §6.1 root cause 4 / ONB-06): one
 * `inputAccessoryViewID` shared by every field, with a label that changes
 * (Next -> Done), breaks the numeric "Next" bar on iOS.
 */
const weightsAccessoryId = (exerciseId: string): string => `gym-setup-weights-bar-${exerciseId}`;

// 11 Oct restyle: the shell's look — canvas, hairline surface cards, named
// text styles, colour roles, TrainButton, and a brand chevron Back.
/** The redesign's card: a surface on the canvas with a hairline border. */
const CARD = 'gap-3 rounded-card border border-separator bg-surface p-4';

function ProgressDots({ step }: { step: number }) {
  return (
    <View
      testID="gym-setup-progress"
      accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}
      className="flex-row items-center justify-center gap-2 py-1"
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
        <View
          key={n}
          className={cn(
            'h-2 w-2 rounded-full',
            n === step ? 'bg-brand' : n < step ? 'bg-brand/40' : 'bg-surface-sunken',
          )}
        />
      ))}
    </View>
  );
}

function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <View className="gap-1.5">
      {/* Stable testID across every step (gym-mode.flow.yaml anchors on it to
          detect "setup opened on top of Today", same contract the G1-C
          placeholder shipped). */}
      <Text
        testID="gym-setup-title"
        accessibilityRole="header"
        className="text-title1 font-bold text-label"
      >
        {title}
      </Text>
      <Text className="text-body text-label-secondary">{description}</Text>
    </View>
  );
}

/** "0,2,4" → [0, 2, 4] (weekday indices, Mon = 0), invalid/out-of-range entries dropped. */
function parseWeekdaysParam(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

export interface SetupWizardProps {
  /**
   * Simple training mode §6.1: "I follow a program…" was answered first — the
   * wizard runs unchanged and `completeSetup` records the PROGRESSIVE style.
   */
  trainingStyle?: 'PROGRESSIVE';
  /** Back from the first step returns to that question instead of leaving setup. */
  onExitFirstStep?: () => void;
}

export function SetupWizard({ trainingStyle, onExitFirstStep }: SetupWizardProps = {}) {
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  // The cached library (cache-only, never fetched here) gives the new-shell
  // program days their cover photo — the first exercise that has one.
  const cachedLibrary = useQuery<GymBootstrap>({
    queryKey: gymBootstrapQueryKey,
    queryFn: skipToken,
  }).data?.library;
  const imagesOf = useMemo(() => libraryImages(cachedLibrary), [cachedLibrary]);
  // 10 Oct redesign (board GymSetup): in the new shell step 5 is drawn by
  // `ProgramStep`; every other step, and step 5 in the old shell, is unchanged.
  const shellV2 = useShellV2();

  // T-03.4 (UX-03 AC2/AC3): L-HOME's onboarding hands off to gym setup with
  // `?from=onboarding&days=0,2,4` when the user picked Train + a food job —
  // step 1 (count) and step 4 (weekdays) come pre-filled and the wizard
  // opens straight at step 2, skipping the now-redundant count question.
  // Train-only unchanged (no params, AC2): opens at step 1 as it always has.
  const params = useLocalSearchParams<{ from?: string; days?: string }>();
  const fromOnboarding = params.from === 'onboarding';
  const initialWeekdays = useMemo(
    () => (fromOnboarding ? parseWeekdaysParam(params.days) : []),
    [fromOnboarding, params.days],
  );
  const firstStep = fromOnboarding && initialWeekdays.length > 0 ? 2 : 1;

  const [step, setStep] = useState(firstStep);
  const [days, setDays] = useState(initialWeekdays.length > 0 ? initialWeekdays.length : 3);
  // T-36.6 (UX-36 (6)): "How long can a session usually be?" — optional;
  // null = not answered (nothing is sent, and Start offers `Full` by default).
  const [sessionLengthMins, setSessionLengthMins] = useState<number | null>(null);
  const [experience, setExperience] = useState<TrainingExperience>('BEGINNER');
  // UX-05 B (T-05.2): "Do you already follow a split?" — only asked once the
  // user says they're Experienced. `null` = "Pick one for me" (the default,
  // and what a "New or returning" answer implies too).
  const [split, setSplit] = useState<GymSplitPreference | null>(null);
  const [equipmentAccess, setEquipmentAccess] = useState<GymEquipmentAccess>('FULL_GYM');
  const [unit, setUnit] = useState<WeightUnit>(() => defaultUnitFromLocale());
  // One unit preference across Food and Gym (P2-6): once preferences load,
  // the saved unit system wins over the locale guess. Applied once, so it
  // never overrides a pick.
  const utils = trpc.useUtils();
  // UX-GYM-05: fresh on every open. A cached copy from before onboarding saved
  // "Imperial" made this default to kg and `completeSetup` then flipped the
  // whole app back to metric. Wait for that refetch to settle (offline it is
  // paused, so the cache is used); the locale guess is only the fallback for a
  // user with no saved unit, and a unit the user already tapped is never
  // overridden.
  const prefs = trpc.preferences.get.useQuery(undefined, {
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const unitDefaulted = useRef(false);
  const unitPicked = useRef(false);
  useEffect(() => {
    if (unitDefaulted.current || prefs.isLoading || prefs.isFetching) return;
    unitDefaulted.current = true;
    const preferred = prefs.data?.chefProfile?.preferredUnits;
    if (preferred && !unitPicked.current) setUnit(weightUnitForSystem(preferred));
  }, [prefs.isLoading, prefs.isFetching, prefs.data]);
  const [weekdays, setWeekdays] = useState<number[]>(initialWeekdays);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  // UX-GYM-04: the OS refused the permission ask — the switch stays "No
  // reminder" and a notice points to Settings instead of pretending.
  const [reminderRefused, setReminderRefused] = useState(false);
  const [reminderHour, setReminderHour] = useState(7);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [overrideKey, setOverrideKey] = useState<string | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [weightsChoice, setWeightsChoice] = useState<'help' | 'know' | null>(null);
  const [knownWeights, setKnownWeights] = useState<Record<string, string>>({});

  // Changing any recommend input invalidates a picked alternative and any
  // weight guesses already typed for the old routine's exercises.
  const resetForNewRecommendation = () => {
    setOverrideKey(null);
    setWeightsChoice(null);
    setKnownWeights({});
  };

  const recommendInput = useMemo(
    () => ({
      days,
      experience,
      equipmentAccess,
      ...(experience === 'INTERMEDIATE' && split ? { split } : {}),
    }),
    [days, experience, equipmentAccess, split],
  );
  const recommendQuery = trpc.gym.profile.recommend.useQuery(recommendInput, {
    enabled: step >= 5,
    staleTime: Infinity,
    retry: false,
  });

  const templateKey = overrideKey ?? recommendQuery.data?.recommendedKey ?? null;
  const isRecommended = templateKey !== null && templateKey === recommendQuery.data?.recommendedKey;

  const preview: TemplatePreview | null = useMemo(() => {
    if (!templateKey) return null;
    try {
      return buildTemplatePreview(templateKey, equipmentAccess, experience);
    } catch {
      return null;
    }
  }, [templateKey, equipmentAccess, experience]);

  const whyText = isRecommended
    ? recommendQuery.data?.reason
    : recommendQuery.data?.alternatives.find((t) => t.key === templateKey)?.description;

  const exercises = useMemo(() => (preview ? knownWeightExercisesOf(preview) : []), [preview]);

  // Starting weights (dogfood #2): the keyboard used to cover whichever
  // field you were typing into. `decimal-pad` has no Return key on iOS, so
  // `weightsAccessoryId` gives every field here its own NumericReturnBar
  // ("Next", or "Done" on the last); on Android the IME already renders one
  // for `returnKeyType`, and `inputAccessoryViewID` is simply ignored.
  const weightsChain = useFieldChain(exercises.length);
  const scrollFieldIntoView = useScrollFieldIntoView();

  useEffect(() => {
    if (step === 6 && weightsChoice === null) {
      setWeightsChoice(experience === 'INTERMEDIATE' ? 'know' : 'help');
    }
  }, [step, weightsChoice, experience]);

  // UX-GYM-03: hardware BACK used to pop the wizard and drop every answer.
  // BACK now steps back one page; on the first page it asks before leaving
  // (also covers the header chevron). The guard is released on success.
  const stepRef = useRef(step);
  stepRef.current = step;
  const guardRef = useRef<{ release: () => void } | null>(null);

  const completeSetupMutation = trpc.gym.profile.completeSetup.useMutation({
    onSuccess: (bootstrap) => {
      queryClient.setQueryData(gymBootstrapQueryKey, bootstrap);
      // The setup unit became the global unit preference (P2-6).
      void utils.preferences.get.invalidate();
      guardRef.current?.release();
      router.replace('/today');
    },
    // The wizard renders the failure at the bottom of the last step.
    meta: { silent: true },
  });

  const guard = useUnsavedGuard(!completeSetupMutation.isSuccess, {
    title: 'Leave setup?',
    message: 'Your answers will be lost.',
    discardLabel: 'Leave setup',
    keepLabel: 'Keep going',
    onBack: () => {
      if (completeSetupMutation.isPending) return true;
      if (stepRef.current > firstStep) {
        setStep((s) => s - 1);
        return true;
      }
      if (onExitFirstStep) {
        onExitFirstStep();
        return true;
      }
      return false;
    },
  });
  guardRef.current = guard;

  const goBack = () => {
    if (completeSetupMutation.isPending) return;
    // T-03.4: back from the wizard's first visible step — step 1 normally,
    // or step 2 when onboarding pre-filled step 1 and skipped it — returns
    // to whatever pushed this screen (onboarding, or Today).
    if (step === firstStep) {
      if (onExitFirstStep) {
        onExitFirstStep();
        return;
      }
      if (router.canGoBack()) router.back();
      else router.replace('/today');
      return;
    }
    setStep((s) => s - 1);
  };

  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));

  const handleFinish = () => {
    if (!templateKey || completeSetupMutation.isPending || hasWeightErrors) return;
    const knownWeightsKg: Record<string, number> = {};
    if (weightsChoice === 'know') {
      for (const [exerciseId, raw] of Object.entries(knownWeights)) {
        const value = parseFloat(raw.replace(',', '.'));
        if (Number.isFinite(value) && value > 0) {
          knownWeightsKg[exerciseId] = unitToKg(value, unit);
        }
      }
    }
    const reminderTime = reminderEnabled
      ? `${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')}`
      : null;
    if (sessionLengthMins !== null) {
      captureGymEvent('session_time_chosen', { minutes: sessionLengthMins, where: 'setup' });
    }
    completeSetupMutation.mutate({
      days,
      experience,
      equipmentAccess,
      unit,
      templateKey,
      plannedWeekdays: [...weekdays].sort((a, b) => a - b),
      reminderTime,
      ...(trainingStyle ? { trainingStyle } : {}),
      ...(sessionLengthMins !== null ? { sessionLengthMins } : {}),
      ...(experience === 'INTERMEDIATE' && split ? { split } : {}),
      ...(weightsChoice === 'know' && Object.keys(knownWeightsKg).length > 0
        ? { knownWeightsKg }
        : {}),
    });
  };

  // UX-GYM-01: starting weights are checked per field, against the same
  // bounds the server enforces, before they can be sent.
  const weightErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (weightsChoice !== 'know') return errors;
    for (const ex of exercises) {
      const message = startingWeightError(knownWeights[ex.exerciseId] ?? '', unit);
      if (message) errors[ex.exerciseId] = message;
    }
    return errors;
  }, [weightsChoice, exercises, knownWeights, unit]);
  const hasWeightErrors = Object.keys(weightErrors).length > 0;

  const canGoNext = step === 5 ? preview !== null : step === 6 ? !hasWeightErrors : true;

  if (shellV2 && step === 5) {
    return (
      <ProgramStep
        step={step}
        totalSteps={TOTAL_STEPS}
        onBack={goBack}
        recommendation={recommendQuery.data}
        isLoading={recommendQuery.isLoading}
        isError={recommendQuery.isError}
        onRetry={() => void recommendQuery.refetch()}
        selectedKey={templateKey}
        onSelect={(key) => {
          if (key === templateKey) return;
          // Same reset as legacy's "Use this": a new routine drops the old
          // routine's weight guesses.
          setOverrideKey(key);
          setWeightsChoice(null);
          setKnownWeights({});
        }}
        preview={preview}
        sessionLengthMins={sessionLengthMins}
        coverOf={(exerciseIds) => exerciseCoverUrl(exerciseIds, imagesOf)}
        canGoNext={canGoNext}
        onNext={goNext}
      >
        <ConfirmSheet testID="gym-setup-leave" {...guard.sheetProps} />
      </ProgramStep>
    );
  }

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <View className="mx-4 mt-3 min-h-11 flex-row items-center gap-3">
        <IconButton
          testID="gym-setup-title-back"
          accessibilityLabel="Back"
          icon={<Icon name="chevronBack" color={colors.brand} size={26} />}
          onPress={goBack}
          className="-ml-2"
        />
        <View className="flex-1">
          <ProgressDots step={step} />
        </View>
        <View className="w-11" />
      </View>

      {/* UX-GYM-30: keyed by step so each page opens at the top — "Starting
          weights" used to inherit the previous page's scroll offset. */}
      <KeyboardAwareScrollView
        key={`step-${String(step)}`}
        testID="gym-setup-scroll"
        contentContainerClassName="gap-5 px-4 py-4"
        footer={
          <View className="gap-2 border-t border-separator bg-surface px-4 pb-2 pt-3">
            {step === 4 && (
              <TrainButton variant="ghost" testID="gym-setup-skip" label="Skip" onPress={goNext} />
            )}
            {/* Advisory disclaimer (2026-10-02): shown where the user
                accepts the suggested program, right above "Start training". */}
            {step === 7 && (
              <Text
                testID="gym-setup-advisory-disclaimer"
                className="text-caption text-label-secondary"
              >
                {WELLNESS_COPY.gymAdvisoryDisclaimer}
              </Text>
            )}
            {step < 7 ? (
              <TrainButton
                testID="gym-setup-next"
                label="Next"
                size="lg"
                disabled={!canGoNext}
                onPress={goNext}
              />
            ) : (
              <TrainButton
                testID="gym-setup-finish"
                label="Start training"
                size="lg"
                loading={completeSetupMutation.isPending}
                disabled={!templateKey}
                onPress={handleFinish}
              />
            )}
          </View>
        }
      >
        {step === 1 && (
          <View className="gap-5">
            <StepHeader
              title="How many days a week can you train?"
              description="Pick what you can keep up on a busy week. Consistency beats ambition."
            />
            <ChipGroup
              testID="gym-setup-days"
              options={[2, 3, 4, 5, 6].map((n) => ({
                value: n,
                label: String(n),
                testID: `gym-setup-days-${n}`,
              }))}
              value={[days]}
              onChange={(v) => {
                const next = v[0];
                if (next !== undefined) {
                  setDays(next);
                  resetForNewRecommendation();
                }
              }}
            />
            <View className="gap-2">
              <Text
                testID="gym-setup-length-title"
                className="text-headline font-semibold text-label"
              >
                How long can a session usually be?
              </Text>
              <Text className="text-subhead text-label-secondary">
                Optional. On a short day, Start can trim the workout to fit.
              </Text>
              <ChipGroup
                testID="gym-setup-length"
                allowEmpty
                options={SESSION_LENGTH_OPTIONS.map((n) => ({
                  value: n,
                  label: n === 75 ? '75+ min' : `${String(n)} min`,
                  testID: `gym-setup-length-${String(n)}`,
                }))}
                value={sessionLengthMins === null ? [] : [sessionLengthMins]}
                onChange={(v) => setSessionLengthMins(v[0] ?? null)}
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View className="gap-5">
            <StepHeader
              title="How much lifting experience do you have?"
              description="This tunes your starting weights and how fast the program moves."
            />
            <ChipGroup
              testID="gym-setup-experience"
              options={[
                {
                  value: 'BEGINNER' as const,
                  label: 'New or returning',
                  testID: 'gym-setup-experience-beginner',
                },
                {
                  value: 'INTERMEDIATE' as const,
                  label: 'Experienced',
                  testID: 'gym-setup-experience-intermediate',
                },
              ]}
              value={[experience]}
              onChange={(v) => {
                const next = v[0];
                if (next) {
                  setExperience(next);
                  if (next === 'BEGINNER') setSplit(null);
                  resetForNewRecommendation();
                }
              }}
            />
            <Text className="text-caption text-label-secondary">
              &quot;New or returning&quot; means under 6 months of consistent lifting.
            </Text>

            {/* UX-05 B (T-05.2): only asked once experienced — a follow-up on
                the same screen, so step 5 can lead with the matching template. */}
            {experience === 'INTERMEDIATE' && (
              <View className="gap-2">
                <Text className="text-headline font-semibold text-label">
                  Do you already follow a split?
                </Text>
                <ChipGroup
                  testID="gym-setup-split"
                  options={[
                    {
                      value: 'PICK_FOR_ME',
                      label: 'Pick one for me',
                      testID: 'gym-setup-split-auto',
                    },
                    {
                      value: 'PUSH_PULL_LEGS',
                      label: 'Push / Pull / Legs',
                      testID: 'gym-setup-split-ppl',
                    },
                    { value: 'UPPER_LOWER', label: 'Upper / Lower', testID: 'gym-setup-split-ul' },
                    { value: 'FULL_BODY', label: 'Full body', testID: 'gym-setup-split-fb' },
                  ]}
                  value={[split ?? 'PICK_FOR_ME']}
                  onChange={(v) => {
                    const next = v[0];
                    setSplit(!next || next === 'PICK_FOR_ME' ? null : next);
                    resetForNewRecommendation();
                  }}
                />
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View className="gap-6">
            <StepHeader
              title="What equipment do you have?"
              description="A commercial gym gets the most out of the program. Bodyweight plans use no weights, but a pull-up bar and a sturdy table help."
            />
            <ChipGroup
              testID="gym-setup-equipment"
              options={[
                {
                  value: 'FULL_GYM' as const,
                  label: 'Full gym',
                  testID: 'gym-setup-equipment-full_gym',
                },
                {
                  value: 'DUMBBELLS' as const,
                  label: 'Dumbbells + bench',
                  testID: 'gym-setup-equipment-dumbbells',
                },
                {
                  value: 'BODYWEIGHT' as const,
                  label: 'Bodyweight',
                  testID: 'gym-setup-equipment-bodyweight',
                },
              ]}
              value={[equipmentAccess]}
              onChange={(v) => {
                const next = v[0];
                if (next) {
                  setEquipmentAccess(next);
                  resetForNewRecommendation();
                }
              }}
            />
            <View className="gap-2">
              <Text className="text-headline font-semibold text-label">Units</Text>
              <ChipGroup
                testID="gym-setup-unit"
                options={[
                  { value: 'KG' as const, label: 'kg', testID: 'gym-setup-unit-kg' },
                  { value: 'LB' as const, label: 'lb', testID: 'gym-setup-unit-lb' },
                ]}
                value={[unit]}
                onChange={(v) => {
                  const next = v[0];
                  if (next) {
                    unitPicked.current = true;
                    setUnit(next);
                  }
                }}
              />
              <Text className="text-caption text-label-secondary">
                Also used for recipes, shopping lists and your body weight.
              </Text>
            </View>
          </View>
        )}

        {step === 4 && (
          <View className="gap-6">
            <StepHeader
              title="Which days, roughly?"
              description="Used for your week strip and reminders. You can skip this and decide later."
            />
            <ChipGroup
              testID="gym-setup-weekdays"
              multiple
              options={WEEKDAY_LABELS.map((label, i) => ({
                value: i,
                label,
                testID: `gym-setup-weekday-${i}`,
              }))}
              value={weekdays}
              onChange={setWeekdays}
            />
            <View className="gap-2">
              <ChipGroup
                testID="gym-setup-reminder-toggle"
                options={[
                  { value: 'off' as const, label: 'No reminder', testID: 'gym-setup-reminder-off' },
                  { value: 'on' as const, label: 'Remind me', testID: 'gym-setup-reminder-on' },
                ]}
                value={[reminderEnabled ? 'on' : 'off']}
                onChange={(v) => {
                  const enabled = v[0] === 'on';
                  setReminderEnabled(enabled);
                  setReminderRefused(false);
                  // "Want a reminder?" is a direct user action — ask here,
                  // never on cold start (gym_plan.md §6.5). UX-GYM-04: if the
                  // OS says no, the choice goes back to "No reminder".
                  if (enabled) {
                    void ensureGymReminderPermission().then((granted) => {
                      refreshNotificationPermission();
                      if (!granted) {
                        setReminderEnabled(false);
                        setReminderRefused(true);
                      }
                    });
                  }
                }}
              />
              {reminderRefused && (
                <NotificationsOffRow
                  testID="gym-setup-notifications-off"
                  message="Reminders are off for Chefer"
                />
              )}
              {reminderEnabled && (
                <View className="flex-row items-center gap-3">
                  <Stepper
                    testID="gym-setup-reminder-hour"
                    accessibilityLabel="Reminder hour"
                    value={reminderHour}
                    min={0}
                    max={23}
                    format={(v) => String(v).padStart(2, '0')}
                    onChange={setReminderHour}
                    label="hour"
                  />
                  <Text className="text-title3 font-semibold text-label">:</Text>
                  <Stepper
                    testID="gym-setup-reminder-minute"
                    accessibilityLabel="Reminder minute"
                    value={reminderMinute}
                    step={15}
                    min={0}
                    max={45}
                    format={(v) => String(v).padStart(2, '0')}
                    onChange={setReminderMinute}
                    label="min"
                  />
                </View>
              )}
            </View>
          </View>
        )}

        {step === 5 && (
          <View className="gap-4" testID="gym-setup-preview">
            <StepHeader
              title="Your program"
              description="Editable later — this is just the start."
            />
            {recommendQuery.isLoading && (
              <Text className="text-body text-label-secondary" testID="gym-setup-preview-loading">
                Finding your program…
              </Text>
            )}
            {recommendQuery.isError && (
              <View className={CARD}>
                <Text
                  testID="gym-setup-preview-offline"
                  className="text-headline font-semibold text-label"
                >
                  Setup needs a connection.
                </Text>
                <Text className="text-subhead text-label-secondary">Reconnect and try again.</Text>
                <TrainButton
                  testID="gym-setup-preview-retry"
                  label="Try again"
                  onPress={() => void recommendQuery.refetch()}
                />
              </View>
            )}
            {preview && (
              <>
                <View className={cn(CARD, 'gap-2')}>
                  <Text className="text-headline font-semibold text-label">{preview.name}</Text>
                  {whyText && (
                    <Text testID="gym-setup-why" className="text-subhead text-label-secondary">
                      {whyText}
                    </Text>
                  )}
                </View>
                {/* UX-05 B (T-05.2, AC3): alternatives sit right under the
                    program card as visible rows — never below the fold —
                    with the existing "Choose another program" sheet kept as
                    a second path to the full list. */}
                {recommendQuery.data && recommendQuery.data.alternatives.length > 0 && (
                  <View className="gap-2" testID="gym-setup-alternatives-inline">
                    <Text className="px-4 text-subhead font-semibold text-label-secondary">
                      Other programs that fit {days} days
                    </Text>
                    {recommendQuery.data.alternatives.map((t) => (
                      <View
                        key={t.key}
                        testID={`gym-setup-alt-inline-${t.key}`}
                        className={cn(CARD, 'flex-row items-center justify-between gap-2')}
                      >
                        <View className="min-w-0 flex-1">
                          <Text className="text-body font-semibold text-label">{t.name}</Text>
                          <Text className="text-subhead text-label-secondary">
                            {t.daysPerWeek}× a week · {t.description}
                          </Text>
                        </View>
                        <TrainButton
                          testID={`gym-setup-alt-use-${t.key}`}
                          label="Use this"
                          variant="tinted"
                          onPress={() => {
                            setOverrideKey(t.key);
                            setWeightsChoice(null);
                            setKnownWeights({});
                          }}
                        />
                      </View>
                    ))}
                  </View>
                )}
                <View className="gap-3">
                  {preview.days.map((day, i) => (
                    <View
                      key={`${day.name}-${i}`}
                      testID={`gym-setup-preview-day-${i}`}
                      className={cn(CARD, 'gap-2')}
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="min-w-0 flex-1 text-headline font-semibold text-label">
                          {day.name}
                        </Text>
                        <Text className="text-caption text-label-secondary">
                          ~{day.estimatedMin} min
                        </Text>
                      </View>
                      {sessionLengthMins !== null && day.estimatedMin > sessionLengthMins ? (
                        <Text
                          testID={`gym-setup-preview-day-${i}-long`}
                          className="text-caption text-attention"
                        >
                          {`Longer than your ${String(sessionLengthMins)} min — pick a shorter time at Start and we’ll trim it.`}
                        </Text>
                      ) : null}
                      {day.exercises.map((ex) => (
                        <View key={ex.exerciseId} className="flex-row items-center justify-between">
                          <ExerciseNameLink
                            testID={`gym-setup-preview-exercise-${ex.exerciseId}`}
                            exerciseId={ex.exerciseId}
                            name={ex.name}
                            numberOfLines={1}
                            className="flex-1 pr-2"
                            textClassName="text-subhead"
                          />
                          <Text className="text-caption text-label-secondary">
                            {ex.sets} ×{' '}
                            {ex.repMin === ex.repMax ? ex.repMin : `${ex.repMin}-${ex.repMax}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
                <View className={cn(CARD, 'gap-2')} testID="gym-setup-volume">
                  <Text className="text-headline font-semibold text-label">Weekly balance</Text>
                  {preview.volume.map((v) => {
                    const pct = Math.min(100, (v.fractional / Math.max(1, v.productiveMax)) * 100);
                    return (
                      <View key={v.group} className="gap-1">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-caption text-label">
                            {VOLUME_GROUP_LABELS[v.group as VolumeGroup]}
                          </Text>
                          <Text className="text-caption text-label-secondary">
                            {v.fractional} sets
                          </Text>
                        </View>
                        <View className="h-1.5 rounded-full bg-surface-sunken">
                          <View
                            className="h-1.5 rounded-full bg-brand"
                            style={{ width: `${pct}%` }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
                <TrainButton
                  variant="outline"
                  testID="gym-setup-choose-alt"
                  label="Choose another program"
                  onPress={() => setShowAlternatives(true)}
                />
              </>
            )}
            <Sheet
              visible={showAlternatives}
              onClose={() => setShowAlternatives(false)}
              title="Other programs"
              testID="gym-setup-alternatives"
            >
              {recommendQuery.data?.alternatives.map((t) => (
                <Pressable
                  key={t.key}
                  testID={`gym-setup-alt-${t.key}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setOverrideKey(t.key);
                    setWeightsChoice(null);
                    setKnownWeights({});
                    setShowAlternatives(false);
                  }}
                  className="min-h-11 gap-1 border-b border-separator py-3"
                >
                  <Text className="text-body font-semibold text-label">{t.name}</Text>
                  <Text className="text-subhead text-label-secondary">
                    {t.daysPerWeek}× a week · {t.description}
                  </Text>
                </Pressable>
              ))}
            </Sheet>
          </View>
        )}

        {step === 6 && (
          <View className="gap-5">
            <StepHeader
              title="Starting weights"
              description="We can find them for you over your first sessions, or you can enter what you know."
            />
            <ChipGroup
              testID="gym-setup-weights-choice"
              options={[
                {
                  value: 'help' as const,
                  label: 'Help me find them',
                  testID: 'gym-setup-weights-help',
                },
                {
                  value: 'know' as const,
                  label: 'I know my weights',
                  testID: 'gym-setup-weights-know',
                },
              ]}
              value={weightsChoice ? [weightsChoice] : []}
              onChange={(v) => setWeightsChoice(v[0] ?? null)}
            />
            {weightsChoice === 'know' && exercises.length === 0 ? (
              <Text testID="gym-setup-weights-none" className="text-subhead text-label-secondary">
                Nothing to enter: bodyweight exercises start from your reps.
              </Text>
            ) : null}
            {weightsChoice === 'know' && (
              <View className="gap-3">
                {exercises.map((ex, i) => (
                  <View key={ex.exerciseId} className="gap-1">
                    <View className="flex-row items-center gap-3">
                      <Text numberOfLines={1} className="min-w-0 flex-1 text-body text-label">
                        {ex.name}
                      </Text>
                      <Input
                        testID={`gym-setup-weight-${ex.exerciseId}`}
                        accessibilityLabel={`${ex.name} starting weight in ${unitLabel(unit)}`}
                        aria-invalid={weightErrors[ex.exerciseId] !== undefined}
                        keyboardType="decimal-pad"
                        inputAccessoryViewID={
                          Platform.OS === 'ios' ? weightsAccessoryId(ex.exerciseId) : undefined
                        }
                        placeholder={unitLabel(unit)}
                        value={knownWeights[ex.exerciseId] ?? ''}
                        onChangeText={(text) =>
                          setKnownWeights((prev) => ({ ...prev, [ex.exerciseId]: text }))
                        }
                        className="w-24 text-right"
                        {...weightsChain.bind(i, { onFocus: scrollFieldIntoView })}
                      />
                      <Text className="text-caption text-label-secondary">{unitLabel(unit)}</Text>
                    </View>
                    <NumericReturnBar
                      nativeID={weightsAccessoryId(ex.exerciseId)}
                      label={i === exercises.length - 1 ? 'Done' : 'Next'}
                      onPress={() => weightsChain.focusNext(i)}
                      testID={`gym-setup-weights-return-${ex.exerciseId}`}
                    />
                    {weightErrors[ex.exerciseId] ? (
                      <Text
                        testID={`gym-setup-weight-error-${ex.exerciseId}`}
                        accessibilityLiveRegion="polite"
                        className="text-right text-caption text-danger"
                      >
                        {weightErrors[ex.exerciseId]}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {step === 7 && (
          <View className="gap-5">
            <StepHeader
              title="You're set"
              description="One last thing before your first session."
            />
            <View className={cn(CARD, 'gap-1')}>
              <Text className="text-headline font-semibold text-label">
                {preview?.name ?? 'Your program'}
              </Text>
              <Text className="text-subhead text-label-secondary">
                {days}× a week ·{' '}
                {equipmentAccess === 'FULL_GYM'
                  ? 'Full gym'
                  : equipmentAccess === 'DUMBBELLS'
                    ? 'Dumbbells + bench'
                    : 'Bodyweight'}
              </Text>
            </View>
            <Text testID="gym-setup-expectation" className="text-body text-label-secondary">
              The first 6–8 weeks build the habit. Missing a session changes nothing. Aim for your
              weekly goal.
            </Text>
            {completeSetupMutation.isError && (
              <Text className="text-subhead text-danger" testID="gym-setup-error">
                {gymErrorMessage(completeSetupMutation.error)}
              </Text>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>
      <ConfirmSheet testID="gym-setup-leave" {...guard.sheetProps} />
    </Screen>
  );
}
