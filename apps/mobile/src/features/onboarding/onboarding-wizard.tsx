import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { OnboardingJob } from '@chefer/types';
import { bodyMetricsAgeError, LB_PER_KG } from '@chefer/types';
import { Button, ErrorState, Screen, Text } from '@chefer/ui-mobile';
import {
  aiConsentRequiredFor,
  inferUnitsFromInput,
  inToCm,
  onboardingProgress,
  onboardingSteps,
  userFacingErrorMessage,
  type OnboardingStepKey,
} from '@chefer/utils';
import { useIsPremium } from '../../hooks/use-is-premium';
import { trpc } from '../../lib/trpc';
import { useAiConsent } from '../ai-consent/ai-consent-provider';
import { setMode } from '../gym/mode-store';
import { HouseholdEditor } from '../household/household-editor';
import { CuisineStep, type CuisineStepValue } from '../preferences/components/cuisine-step';
import { GoalStep } from '../preferences/components/goal-step';
import { MetricsStep } from '../preferences/components/metrics-step';
import { SafetyStep } from '../preferences/components/safety-step';
import { TargetsCard } from '../preferences/targets-card';
import { GOALS, type Goal, type MetricsValue, type SafetyValue } from '../preferences/types';
import { HEALTH_DECLINED_BODY_NOTICE } from '../privacy/copy';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useHealthConsent } from '../privacy/use-health-consent';
import { ONBOARDING_COPY } from './copy';
import { HowYouCookStep, type HowYouCookStepValue } from './how-you-cook-step';
import { JobsStep } from './jobs-step';
import { TrainingDaysStep, type TrainingDayKind } from './training-days-step';

// Onboarding — dogfood feedback #9: a new account used to land straight on
// the dashboard. Now register (app/(auth)/register.tsx) routes here first.
//
// v3 (UX-03, T-03.2/T-03.3, rev 2): the jobs-based wizard. Step 1 replaces
// "What brings you here?" with a multi-select "What should Chefer help
// with?" (JobsStep); the step list is built from the answer by the shared
// `onboardingSteps({ askJobs: true, ... })` (@chefer/utils) — Train alone
// hands off to gym setup exactly as before, any food job gets Diet → How
// you cook → Goal → Body metrics (+ Targets for Track or Train with a
// numeric goal), premium adds Cuisine at the end. Every tier saves through
// the same free-for-every-tier granular procedures (updateSafety,
// saveProfileBasics) — the old premium/free branch collapses into one
// builder (edge case note, UX-03).

function stepTitle(key: OnboardingStepKey, isPremium: boolean): string {
  switch (key) {
    case 'intent':
      return 'What brings you here?';
    case 'jobs':
      return ONBOARDING_COPY.jobsTitle;
    case 'trainingDays':
      return ONBOARDING_COPY.trainingDaysTitle;
    case 'table':
      return 'Who’s at your table?';
    case 'diet':
      return isPremium ? 'Diet & restrictions' : 'Diet & safety';
    case 'howYouCook':
      return 'How you cook';
    case 'goal':
      return 'Your goal';
    case 'metrics':
      return 'Body metrics';
    case 'cuisine':
      return 'Cuisine & cadence';
    case 'targets':
      return 'Your targets';
  }
}

// §2.11, T-35.2 narrows away RECOMP/PERFORMANCE from the fixed GOALS list —
// see the original comment this carries forward from v1.
function knownGoal(goal: string | null | undefined): Goal | null {
  return GOALS.find((g) => g.value === goal)?.value ?? null;
}

function goToDashboard() {
  router.replace('/(food)');
}

const EMPTY_HOW_YOU_COOK: HowYouCookStepValue = {
  shape: null,
  currency: 'EUR',
  units: 'METRIC',
  autoPlanWeekly: false,
};

export function OnboardingWizard() {
  const isPremium = useIsPremium();
  const utils = trpc.useUtils();
  const requestAiConsent = useAiConsent();
  // T-26.2 (UX-26): allergies/diets, goal and body metrics are health information —
  // asked once, the first time a step holding any of them is continued. SEPARATE
  // from the AI consent above (which still guards the first-week generation).
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [healthDeclined, setHealthDeclined] = useState<'diet' | 'body' | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [jobs, setJobsState] = useState<OnboardingJob[]>([]);
  const [trainingWeekdays, setTrainingWeekdays] = useState<number[]>([]);
  const [trainingDayKinds, setTrainingDayKinds] = useState<Record<number, TrainingDayKind>>({});
  const [howYouCook, setHowYouCook] = useState<HowYouCookStepValue>(EMPTY_HOW_YOU_COOK);
  // §2.4, T-03.8 (bug B-43): set when a typed height/weight didn't fit the
  // current units and the metrics step auto-switched — `from` is the unit
  // Undo restores. `howYouCook.units` is the single units source the whole
  // wizard shares (How you cook and Body metrics), even on a Track-only
  // chain where How you cook never renders.
  const [unitSwitchNotice, setUnitSwitchNotice] = useState<{
    from: 'METRIC' | 'IMPERIAL';
  } | null>(null);
  const [goodFood, setGoodFood] = useState(false);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [metrics, setMetrics] = useState<MetricsValue>({
    biologicalSex: null,
    age: null,
    heightCm: null,
    weightKg: null,
    activityLevel: null,
  });
  const [ageText, setAgeText] = useState('');
  const [heightText, setHeightText] = useState('');
  const [weightText, setWeightText] = useState('');
  const [safety, setSafety] = useState<SafetyValue>({
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
  });
  const [cuisine, setCuisine] = useState<CuisineStepValue>({
    cuisinePreferences: [],
    mealsPerDay: 3,
  });

  // Start from what's already saved: a wizard re-opened after upgrading used
  // to start blank, and Finish saved empty allergy lists over the real ones
  // (audit F-ONB-1-1). Mirrors web's wizardDataFromPreferences.
  const savedPrefs = trpc.preferences.get.useQuery();
  const savedJobs = useRef<OnboardingJob[] | undefined>(undefined);
  if (savedJobs.current === undefined && savedPrefs.data) {
    savedJobs.current = savedPrefs.data.jobs;
  }
  const hydrated = useRef(false);
  useEffect(() => {
    const saved = savedPrefs.data;
    if (!saved || hydrated.current) return;
    hydrated.current = true;
    const profile = saved.chefProfile;
    const diet = saved.dietaryPreferences;
    if (profile) {
      setGoal(knownGoal(profile.goal));
      setMetrics({
        biologicalSex: profile.biologicalSex ?? null,
        age: profile.age ?? null,
        heightCm: profile.heightCm ?? null,
        weightKg: profile.weightKg ?? null,
        activityLevel: profile.activityLevel ?? null,
      });
      setAgeText(profile.age != null ? String(profile.age) : '');
      setHeightText(profile.heightCm != null ? String(profile.heightCm) : '');
      setWeightText(profile.weightKg != null ? String(profile.weightKg) : '');
    }
    if (diet) {
      setSafety({
        dietaryRestrictions: diet.dietaryRestrictions,
        allergies: diet.allergies,
        dislikedIngredients: diet.dislikedIngredients,
      });
      setCuisine({
        cuisinePreferences: diet.cuisinePreferences,
        mealsPerDay: diet.mealsPerDay,
      });
    }
  }, [savedPrefs.data]);

  const setJobsMutation = trpc.preferences.setJobs.useMutation({
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const setDayKindsMutation = trpc.training.setDayKinds.useMutation();
  const setShapeMutation = trpc.mealPlan.setShape.useMutation();
  const setDisplayPrefsMutation = trpc.preferences.setDisplayPreferences.useMutation();
  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const profileBasicsMutation = trpc.preferences.saveProfileBasics.useMutation({
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const updateTargetsMutation = trpc.preferences.updateTargets.useMutation();
  // R-18: the first week generates in the background AFTER onboarding has
  // already navigated to Today, so the dashboard cached at navigation time
  // says "nothing planned". Invalidate everything that reads the plan when the
  // generation lands (success or failure). These are mutation-level callbacks,
  // so they still fire after the wizard has unmounted.
  const generateMutation = trpc.mealPlan.generate.useMutation({
    onSettled: () => {
      void utils.mealPlan.invalidate();
      void utils.dashboard.invalidate();
      void utils.shoppingList.invalidate();
    },
  });

  // Bug (UX-03): the ScrollView is one persistent instance across every
  // step, so a step reached scrolled down (e.g. How you cook, which needs
  // scrolling to reach the auto-plan toggle) carried that offset straight
  // into the next step. The content visually snapped back on its own a
  // beat later, but a tap delivered before that correction lands on
  // whatever the stale offset put under it — on the goal step this meant
  // the very first Continue tap after How you cook could miss "Lose
  // Weight" entirely and silently leave `goal` at null, which then
  // silently dropped the whole `targets` step for Train + a numeric goal
  // (03 UX-03 flow table). Reset to the top on every step change instead.
  // Keyed on `step` (not `stepKey`) so this hook can sit above the loading/
  // error early returns below, where `steps`/`stepKey` aren't computed yet
  // — hooks can't follow a conditional return.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  if (savedPrefs.isError && !savedPrefs.data) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ErrorState
          title="Couldn't load your setup"
          description="Nothing has been changed. Check your connection and try again."
          icon={<Ionicons name="cloud-offline-outline" size={40} color="#9ca3af" />}
          onRetry={() => void savedPrefs.refetch()}
        />
      </Screen>
    );
  }

  if (isPremium === undefined || savedPrefs.isLoading) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']} className="items-center justify-center">
        <ActivityIndicator size="large" color="#944a00" />
      </Screen>
    );
  }

  const askJobs = (savedJobs.current ?? []).length === 0;
  const effectiveJobsAnswer = askJobs ? jobs : (savedJobs.current ?? []);
  const steps = onboardingSteps({
    intent: null,
    askIntent: false,
    isPremium,
    jobs: effectiveJobsAnswer,
    askJobs: true,
    hasNumericGoal: !goodFood && goal !== null,
  });
  const totalSteps = steps.length;
  const stepKey: OnboardingStepKey = steps[Math.min(step, totalSteps - 1)] ?? 'diet';
  const progress = onboardingProgress(steps, step);
  const progressPct = progress.percent ?? 0;
  const isSubmitting =
    setJobsMutation.isPending ||
    safetyMutation.isPending ||
    profileBasicsMutation.isPending ||
    setShapeMutation.isPending ||
    setDisplayPrefsMutation.isPending ||
    updateTargetsMutation.isPending;

  function handleAgeText(raw: string) {
    setAgeText(raw);
    const n = parseInt(raw, 10);
    setMetrics((m) => ({ ...m, age: raw === '' || isNaN(n) ? null : n }));
  }

  /** Raw typed text -> a number in whatever `units` currently means, or null. */
  function parseTyped(raw: string): number | null {
    const n = parseFloat(raw.replace(',', '.'));
    return raw === '' || isNaN(n) ? null : n;
  }

  /**
   * §2.4, T-03.8 (bug B-43, AC11): after either field changes, check whether
   * the two typed values (read fresh from state, in the CURRENT units) fit
   * the other system far better — if so, switch `howYouCook.units` for the
   * whole wizard and re-interpret the SAME typed digits under the new unit
   * (170 stays "170" but now means 170 cm, not 170 in), so the stored
   * heightCm/weightKg are never briefly nonsense mid-switch.
   */
  function checkUnitSwitch(heightRaw: string, weightRaw: string) {
    const currentUnits = howYouCook.units;
    const heightVal = parseTyped(heightRaw);
    const weightVal = parseTyped(weightRaw);
    const result = inferUnitsFromInput({
      heightValue: heightVal,
      weightValue: weightVal,
      currentUnits,
    });
    if (!result.shouldSwitch) return;
    const next = result.suggestedUnits;
    setHowYouCook((h) => ({ ...h, units: next }));
    setMetrics((m) => ({
      ...m,
      ...(heightVal !== null && { heightCm: next === 'IMPERIAL' ? inToCm(heightVal) : heightVal }),
      ...(weightVal !== null && {
        weightKg: next === 'IMPERIAL' ? weightVal / LB_PER_KG : weightVal,
      }),
    }));
    setUnitSwitchNotice({ from: currentUnits });
  }

  function heightWeightToMetric(
    typed: number | null,
    units: 'METRIC' | 'IMPERIAL',
    kind: 'height' | 'weight',
  ) {
    if (typed === null) return null;
    if (units !== 'IMPERIAL') return typed;
    return kind === 'height' ? inToCm(typed) : typed / LB_PER_KG;
  }

  function handleHeightText(raw: string) {
    setHeightText(raw);
    const typed = parseTyped(raw);
    setMetrics((m) => ({
      ...m,
      heightCm: heightWeightToMetric(typed, howYouCook.units, 'height'),
    }));
    checkUnitSwitch(raw, weightText);
  }
  function handleWeightText(raw: string) {
    setWeightText(raw);
    const typed = parseTyped(raw);
    setMetrics((m) => ({
      ...m,
      weightKg: heightWeightToMetric(typed, howYouCook.units, 'weight'),
    }));
    checkUnitSwitch(heightText, raw);
  }

  /** Reverts the units switch and re-interprets the same typed digits under the old unit. */
  function undoUnitSwitch() {
    if (!unitSwitchNotice) return;
    const revert = unitSwitchNotice.from;
    setHowYouCook((h) => ({ ...h, units: revert }));
    const heightVal = parseTyped(heightText);
    const weightVal = parseTyped(weightText);
    setMetrics((m) => ({
      ...m,
      ...(heightVal !== null && { heightCm: heightWeightToMetric(heightVal, revert, 'height') }),
      ...(weightVal !== null && { weightKg: heightWeightToMetric(weightVal, revert, 'weight') }),
    }));
    setUnitSwitchNotice(null);
  }

  const hasTrain = jobs.includes('TRAIN');

  /** Fire-and-forget first-week generation (AC7) — a failure never blocks onboarding. */
  function generateFirstWeek() {
    const run = () => generateMutation.mutate({ weekOffset: 0 });
    requestAiConsent('meal-plan', run, {
      usesAi: aiConsentRequiredFor('meal-plan', isPremium === true),
    });
  }

  /** The goal + body fields to store (health information — T-26.2). */
  function buildBasics() {
    return {
      ...(!goodFood && goal !== null && { goal }),
      ...(metrics.biologicalSex !== null && { biologicalSex: metrics.biologicalSex }),
      ...(metrics.age !== null &&
        bodyMetricsAgeError(metrics.age) === null && { age: metrics.age }),
      ...(metrics.heightCm !== null && metrics.heightCm > 0 && { heightCm: metrics.heightCm }),
      ...(metrics.weightKg !== null && metrics.weightKg > 0 && { weightKg: metrics.weightKg }),
      ...(metrics.activityLevel !== null && { activityLevel: metrics.activityLevel }),
    };
  }
  const hasSafetyTerms =
    safety.allergies.length +
      safety.dietaryRestrictions.length +
      safety.dislikedIngredients.length >
    0;

  /**
   * Finish = save everything. Health fields (allergies/diets/dislikes, goal,
   * body metrics) go through the health consent guard: allowed (or already on
   * record) → saved; "Don't save it" → every OTHER answer is still saved and
   * the health fields are left out (AC2).
   */
  function handleFinish() {
    setError(null);
    requestHealthConsent(() => void saveAll(true), {
      hasHealthData: hasSafetyTerms || Object.keys(buildBasics()).length > 0,
      onDeclined: () => {
        setHealthDeclined('diet');
        void saveAll(false);
      },
    });
  }

  async function saveAll(includeHealth: boolean) {
    setError(null);
    try {
      await setJobsMutation.mutateAsync({
        jobs,
        ...(hasTrain && trainingWeekdays.length > 0 && { trainingWeekdays }),
        ...(steps.includes('howYouCook') && { autoPlanWeekly: howYouCook.autoPlanWeekly }),
      });
      if (Object.keys(trainingDayKinds).length > 0) {
        const days = Object.fromEntries(
          Object.entries(trainingDayKinds).map(([weekday, kind]) => [weekday, kind]),
        );
        await setDayKindsMutation.mutateAsync({ days });
      }
      if (steps.includes('howYouCook') && howYouCook.shape) {
        await setShapeMutation.mutateAsync(howYouCook.shape);
        await setDisplayPrefsMutation.mutateAsync({
          preferredUnits: howYouCook.units,
          currency: howYouCook.currency,
        });
      }
      // Clearing the lists stores nothing health-related, so it always runs;
      // with health left out (declined) nothing health-related is sent at all.
      if (includeHealth) {
        await safetyMutation.mutateAsync(safety);
        const basics = buildBasics();
        if (Object.keys(basics).length > 0) {
          await profileBasicsMutation.mutateAsync(basics);
        }
      }
      if (isPremium && steps.includes('cuisine')) {
        await updateTargetsMutation.mutateAsync({
          cuisinePreferences: cuisine.cuisinePreferences,
          mealsPerDay: cuisine.mealsPerDay,
        });
      }
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();

      if (hasTrain) {
        // Train + food (AC3/AC9): a first week generates in the background
        // while the gym wizard opens pre-filled at step 2 (T-03.4 — the
        // days/pre-fill handling itself is L-GYM's setup-wizard, see the
        // final report).
        generateFirstWeek();
        setMode('gym');
        router.replace('/today');
        const days = [...trainingWeekdays].sort((a, b) => a - b).join(',');
        router.push(`/gym/setup?from=onboarding${days ? `&days=${days}` : ''}`);
        return;
      }
      generateFirstWeek();
      goToDashboard();
    } catch {
      // onError already surfaced the message for the mutations that set one.
    }
  }

  async function handleJobsContinue() {
    if (jobs.length === 0) return;
    try {
      await setJobsMutation.mutateAsync({ jobs });
    } catch {
      return;
    }
    const trainOnly = jobs.length === 1 && jobs[0] === 'TRAIN';
    if (trainOnly) {
      // Train only (AC2): gym setup exactly as today, food later.
      setMode('gym');
      router.replace('/today');
      router.push('/gym/setup');
      return;
    }
    setStep((s) => s + 1);
  }

  function handleSkip() {
    // "Just looking around" on the jobs step only — saves PLAN_MEALS and
    // goes straight to Food Today (replaces "Skip for now" on this step).
    if (stepKey === 'jobs') {
      setJobsState(['PLAN_MEALS']);
      setJobsMutation.mutate(
        { jobs: ['PLAN_MEALS'] },
        {
          onSuccess: () => {
            void utils.preferences.invalidate();
            goToDashboard();
          },
        },
      );
      return;
    }
    // Every later step is already optional/skippable — Skip just finishes
    // with whatever is filled in so far, same as Continue would.
    handleFinish();
  }

  function handleBack() {
    if (step > 0) {
      setStep((s) => s - 1);
      return;
    }
    goToDashboard();
  }

  function handleContinue() {
    setError(null);
    if (stepKey === 'jobs') {
      void handleJobsContinue();
      return;
    }
    // T-26.2: ask when leaving the step that holds health information, so the
    // sheet appears where the user just typed it. "Don't save it" discards
    // that step's health fields (they are never sent) and keeps the step open
    // with an amber notice — Continue again moves on.
    if (stepKey === 'diet' && hasSafetyTerms) {
      requestHealthConsent(advance, {
        onDeclined: () => {
          setSafety({ dietaryRestrictions: [], allergies: [], dislikedIngredients: [] });
          setHealthDeclined('diet');
        },
      });
      return;
    }
    const bodyStepHasData =
      (stepKey === 'goal' && !goodFood && goal !== null) ||
      (stepKey === 'metrics' && Object.values(metrics).some((v) => v !== null && v !== undefined));
    if (bodyStepHasData) {
      requestHealthConsent(advance, {
        onDeclined: () => {
          if (stepKey === 'goal') setGoal(null);
          else {
            setMetrics({
              biologicalSex: null,
              age: null,
              heightCm: null,
              weightKg: null,
              activityLevel: null,
            });
            setAgeText('');
            setHeightText('');
            setWeightText('');
          }
          setHealthDeclined('body');
        },
      });
      return;
    }
    advance();
  }

  function advance() {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  }

  // ── Step content ─────────────────────────────────────────────────────────

  let content: React.ReactNode = null;
  const metricsStep = (
    <View className="gap-3">
      <MetricsStep
        value={metrics}
        onChange={setMetrics}
        goal={goodFood ? null : goal}
        ageText={ageText}
        heightText={heightText}
        weightText={weightText}
        onAgeText={handleAgeText}
        onHeightText={handleHeightText}
        onWeightText={handleWeightText}
        units={howYouCook.units}
      />
      {unitSwitchNotice && (
        <View
          testID="metrics-units-switch-notice"
          className="flex-row flex-wrap items-center gap-2"
        >
          <Text variant="muted" className="flex-1 text-xs">
            {howYouCook.units === 'METRIC'
              ? ONBOARDING_COPY.unitsSwitchedToMetric
              : ONBOARDING_COPY.unitsSwitchedToImperial}
          </Text>
          <Pressable
            testID="metrics-units-switch-undo"
            accessibilityRole="button"
            onPress={undoUnitSwitch}
            className="min-h-11 justify-center"
          >
            <Text className="text-xs font-semibold text-primary">Undo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
  if (stepKey === 'jobs') {
    content = <JobsStep value={jobs} onChange={setJobsState} />;
  } else if (stepKey === 'trainingDays') {
    content = (
      <TrainingDaysStep
        weekdays={trainingWeekdays}
        onWeekdaysChange={setTrainingWeekdays}
        dayKinds={trainingDayKinds}
        onDayKindsChange={setTrainingDayKinds}
        onNotSure={() => setStep((s) => s + 1)}
      />
    );
  } else if (stepKey === 'table') {
    content = (
      <View className="gap-3">
        <Text variant="muted" className="text-sm">
          Add the people you cook for. Their allergies and restrictions apply to every plan — free.
          You can change this any time from Profile → Household.
        </Text>
        <HouseholdEditor variant="onboarding" />
      </View>
    );
  } else if (stepKey === 'diet') {
    content = (
      <View className="gap-3">
        <SafetyStep value={safety} onChange={setSafety} testIDPrefix="onb" />
        {healthDeclined === 'diet' && <HealthDeclinedNotice testID="onb-safety-declined" />}
      </View>
    );
  } else if (stepKey === 'howYouCook') {
    content = <HowYouCookStep value={howYouCook} onChange={setHowYouCook} isPremium={isPremium} />;
  } else if (stepKey === 'cuisine') {
    content = <CuisineStep value={cuisine} onChange={setCuisine} />;
  } else if (stepKey === 'targets') {
    content = <TargetsCard />;
  } else if (stepKey === 'goal') {
    content = (
      <View className="gap-3">
        <Text variant="muted" className="text-center text-sm">
          Optional — skip if you just want chef-picked meals.
        </Text>
        <GoalStep
          value={goodFood ? null : goal}
          onChange={(g) => {
            setGoodFood(false);
            setGoal(g);
          }}
          showGoodFood
          goodFood={goodFood}
          onGoodFood={() => setGoodFood(true)}
        />
        {healthDeclined === 'body' && (
          <HealthDeclinedNotice testID="onb-body-declined" message={HEALTH_DECLINED_BODY_NOTICE} />
        )}
      </View>
    );
  } else {
    content = (
      <View className="gap-3">
        <Text variant="muted" className="text-center text-sm">
          Optional — with these, your calorie target is computed from your body instead of a
          default.
        </Text>
        {metricsStep}
        {healthDeclined === 'body' && (
          <HealthDeclinedNotice testID="onb-body-declined" message={HEALTH_DECLINED_BODY_NOTICE} />
        )}
      </View>
    );
  }

  const canContinue =
    stepKey === 'jobs'
      ? jobs.length > 0
      : stepKey === 'goal'
        ? goodFood || true // goal is always optional past the jobs step
        : // R-02: an age under 16 blocks the body-metrics step until fixed or cleared.
          stepKey === 'metrics'
          ? bodyMetricsAgeError(metrics.age) === null
          : true;

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="px-0">
      {/* Header: back, progress, skip */}
      <View className="flex-row items-center gap-2 px-4 py-3">
        <Pressable
          testID="onboarding-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          className="h-11 w-11 items-center justify-center"
        >
          <Ionicons name="arrow-back" size={20} color="#1f2937" />
        </Pressable>
        <View className="flex-1">
          <Text variant="muted" className="text-xs">
            {progress.percent === null
              ? progress.label
              : `${progress.label} · ${progress.percent}%`}
          </Text>
          <Text testID="onboarding-title" variant="heading">
            {stepTitle(stepKey, isPremium)}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View
        testID="onboarding-progress"
        accessibilityRole="progressbar"
        accessibilityValue={
          progress.total === null
            ? { text: progress.label }
            : { min: 1, max: progress.total, now: step + 1 }
        }
        className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerClassName="gap-4 px-4 py-3 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        {content}
        {error && (
          <View className="rounded-md bg-red-50 px-4 py-3">
            <Text className="text-sm text-red-600">{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Primary Continue button — bottom, thumb reach */}
      <View className="gap-2 border-t border-border px-4 pb-2 pt-3">
        <Button
          testID="onboarding-continue"
          loading={isSubmitting}
          disabled={!canContinue || isSubmitting}
          onPress={handleContinue}
        >
          {stepKey === 'jobs'
            ? `Continue — ${jobs.length} selected`
            : step === totalSteps - 1
              ? hasTrain
                ? ONBOARDING_COPY.finishTrainFood
                : ONBOARDING_COPY.finishFood
              : 'Continue'}
        </Button>
        {stepKey === 'jobs' && (
          <Pressable
            testID="onboarding-skip"
            accessibilityRole="button"
            onPress={handleSkip}
            disabled={isSubmitting}
            className="h-11 items-center justify-center"
          >
            <Text className="text-sm font-semibold text-primary">
              {ONBOARDING_COPY.continueSkip}
            </Text>
          </Pressable>
        )}
      </View>
      {healthConsentSheet}
    </Screen>
  );
}
