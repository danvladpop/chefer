import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import type { OnboardingJob } from '@chefer/types';
import {
  bodyMetricsAgeError,
  effectiveNumbersMode,
  isPlausibleHeightCm,
  isPlausibleWeightKg,
} from '@chefer/types';
import {
  Button,
  colors,
  ConfirmSheet,
  ErrorState,
  KeyboardAwareScrollView,
  Screen,
  Text,
} from '@chefer/ui-mobile';
import {
  aiConsentRequiredFor,
  bodyFieldTexts,
  defaultsForRegion,
  detectRegion,
  heightCmFromText,
  heightValueForInference,
  inferUnitsFromInput,
  inToCm,
  onboardingProgress,
  onboardingSteps,
  parseBodyNumber,
  previewTargetKcalFromBasics,
  toDisplayCurrency,
  userFacingErrorMessage,
  weightKgFromText,
  type OnboardingStepKey,
} from '@chefer/utils';
import { useIsPremium } from '../../hooks/use-is-premium';
import { trackOnboardingCompleted, trackPlanGenerated } from '../../lib/analytics-events';
import { getToken } from '../../lib/auth-store';
import { trpc } from '../../lib/trpc';
import { useAiConsent } from '../ai-consent/ai-consent-provider';
import { setMode } from '../gym/mode-store';
import { HouseholdEditor, type HouseholdEditorHandle } from '../household/household-editor';
import { NumbersModeProvider } from '../numbers-mode/numbers-mode';
import { CuisineStep, type CuisineStepValue } from '../preferences/components/cuisine-step';
import { GoalStep } from '../preferences/components/goal-step';
import { metricsFieldErrors, MetricsStep } from '../preferences/components/metrics-step';
import { SafetyStep } from '../preferences/components/safety-step';
import { NumbersModeChoice, type NumbersModeChoiceValue } from '../preferences/numbers-mode-choice';
import { TargetsCard } from '../preferences/targets-card';
import { GOALS, type Goal, type MetricsValue, type SafetyValue } from '../preferences/types';
import { HEALTH_DECLINED_BODY_NOTICE } from '../privacy/copy';
import { HealthDeclinedNotice } from '../privacy/health-notices';
import { useHealthConsent } from '../privacy/use-health-consent';
import type { SafetyPickerHandle } from '../safety/safety-picker';
import { ONBOARDING_COPY } from './copy';
import { HowYouCookStep, type HowYouCookStepValue } from './how-you-cook-step';
import { JobsStep } from './jobs-step';
import { NudgeStep } from './nudge-step';
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
  type OnboardingDraftAnswers,
} from './onboarding-draft';
import { markOnboardingGateHandled } from './onboarding-gate';
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

/**
 * UX-ONB-04: the device region picks the starting units and currency ONCE, in
 * the wizard's initial state. The How-you-cook step used to apply it in an
 * effect every time it mounted, so going Back and forward again flipped a
 * metric user's choice (and the body metrics typed after it) to the region's.
 */
function initialHowYouCook(): HowYouCookStepValue {
  const { preferredUnits, currency } = defaultsForRegion(detectRegion());
  return { ...EMPTY_HOW_YOU_COOK, units: preferredUnits, currency };
}

/** UX-ONB-08: a stored 86.1825503 kg reads "86.2" (one decimal, the precision the fields take). */
function roundForDisplay(value: number): number {
  return Math.round(value * 10) / 10;
}

const EMPTY_METRICS: MetricsValue = {
  biologicalSex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  activityLevel: null,
};
const EMPTY_SAFETY: SafetyValue = {
  dietaryRestrictions: [],
  allergies: [],
  dislikedIngredients: [],
};

function hasAnySafetyTerm(value: SafetyValue): boolean {
  return (
    value.allergies.length + value.dietaryRestrictions.length + value.dislikedIngredients.length > 0
  );
}

export function OnboardingWizard() {
  const isPremium = useIsPremium();
  const utils = trpc.useUtils();
  const requestAiConsent = useAiConsent();
  // T-26.2 (UX-26): allergies/diets, goal and body metrics are health information —
  // asked once, the first time a step holding any of them is continued. SEPARATE
  // from the AI consent above (which still guards the first-week generation).
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [healthDeclined, setHealthDeclined] = useState<'diet' | 'body' | null>(null);
  // UX-ONB-01: answers typed before an Android BACK-out or a killed process
  // come back from the on-device draft (scoped to this session's token, so
  // another account's answers never appear). Read once, synchronously, so the
  // very first frame is already the resumed step.
  const [draft] = useState(() => readOnboardingDraft(getToken()));
  const [step, setStep] = useState(draft?.step ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [leaveSheetOpen, setLeaveSheetOpen] = useState(false);
  // UX-PO-08: once everything is saved, the last question (a nudge opt-in) shows
  // before the wizard leaves; this is where it goes next. Null = not asking.
  const [afterNudge, setAfterNudge] = useState<(() => void) | null>(null);
  const safetyPickerRef = useRef<SafetyPickerHandle>(null);
  // Set once the setup is finished or skipped: the draft is gone for good and
  // the autosave below must not write it back while the screen unmounts.
  const finished = useRef(false);
  // Only a FIRST-TIME setup is worth resuming. Re-opening the wizard from
  // Preferences (jobs already saved) must not leave a draft that would drag
  // the user back in on the next cold start. Decided once, when the saved
  // preferences first arrive; a resumed draft is a first-time setup by definition.
  const persistDraft = useRef(draft !== null);

  const [jobs, setJobsState] = useState<OnboardingJob[]>(draft?.jobs ?? []);
  const [trainingWeekdays, setTrainingWeekdays] = useState<number[]>(draft?.trainingWeekdays ?? []);
  const [trainingDayKinds, setTrainingDayKinds] = useState<Record<number, TrainingDayKind>>(
    draft?.trainingDayKinds ?? {},
  );
  const [howYouCook, setHowYouCook] = useState<HowYouCookStepValue>(
    () => draft?.howYouCook ?? initialHowYouCook(),
  );
  // §2.4, T-03.8 (bug B-43): set when a typed height/weight didn't fit the
  // current units and the metrics step auto-switched — `from` is the unit
  // Undo restores. `howYouCook.units` is the single units source the whole
  // wizard shares (How you cook and Body metrics), even on a Track-only
  // chain where How you cook never renders.
  // The notice also snapshots the height texts as they were, so Undo restores
  // exactly what was typed (UX-ONB-05: imperial height is feet + inches).
  const [unitSwitchNotice, setUnitSwitchNotice] = useState<{
    from: 'METRIC' | 'IMPERIAL';
    heightText: string;
    inchesText: string;
  } | null>(null);
  const [goodFood, setGoodFood] = useState(draft?.goodFood ?? false);
  // WP-08: protein-only or the full numbers; saved at Finish (never before, so an
  // abandoned setup leaves no half-made profile behind).
  const [numbersMode, setNumbersMode] = useState<NumbersModeChoiceValue>(
    draft?.numbersMode ?? 'FULL',
  );
  const [goal, setGoal] = useState<Goal | null>(knownGoal(draft?.goal));
  const [metrics, setMetrics] = useState<MetricsValue>(draft?.metrics ?? EMPTY_METRICS);
  const [ageText, setAgeText] = useState(draft?.ageText ?? '');
  // UX-ONB-05: imperial height is feet (`heightText`) + inches (`inchesText`).
  // A draft saved before that (no `inchesText`) holds ONE total-inches figure
  // under imperial units, so its fields are rebuilt from the stored cm instead.
  const [draftTexts] = useState(() => {
    if (!draft) return null;
    if (draft.inchesText === undefined && draft.howYouCook?.units === 'IMPERIAL' && draft.metrics) {
      return { ...bodyFieldTexts(draft.metrics, 'IMPERIAL'), weightText: draft.weightText };
    }
    return {
      heightText: draft.heightText,
      inchesText: draft.inchesText ?? '',
      weightText: draft.weightText,
    };
  });
  const [heightText, setHeightText] = useState(draftTexts?.heightText ?? '');
  const [inchesText, setInchesText] = useState(draftTexts?.inchesText ?? '');
  const [weightText, setWeightText] = useState(draftTexts?.weightText ?? '');
  const [safety, setSafety] = useState<SafetyValue>(draft?.safety ?? EMPTY_SAFETY);
  const [cuisine, setCuisine] = useState<CuisineStepValue>(
    draft?.cuisine ?? { cuisinePreferences: [], mealsPerDay: 3 },
  );

  // Start from what's already saved: a wizard re-opened after upgrading used
  // to start blank, and Finish saved empty allergy lists over the real ones
  // (audit F-ONB-1-1). Mirrors web's wizardDataFromPreferences. A resumed
  // draft is newer than the server (it IS the user's latest answers), so it
  // wins and the server copy is not applied over it.
  //
  // UX-ACC-02: this data comes from a query that ran for THIS session — the
  // cache is emptied on every sign-out and sign-in (`signOut()`, `setToken`),
  // so another account's preferences can never be what the wizard starts from.
  const savedPrefs = trpc.preferences.get.useQuery();
  const hydrated = useRef(draft !== null);
  useEffect(() => {
    const saved = savedPrefs.data;
    if (!saved || hydrated.current) return;
    hydrated.current = true;
    persistDraft.current = saved.jobs.length === 0;
    const profile = saved.chefProfile;
    // A wizard re-opened after setup starts from the units and currency the
    // user already chose, not the device region (UX-ONB-04). A first-time
    // setup keeps the region default picked in the initial state.
    let units = howYouCook.units;
    if (profile && saved.jobs.length > 0) {
      units = profile.preferredUnits;
      setHowYouCook((h) => ({
        ...h,
        units,
        currency: toDisplayCurrency(profile.deliveryCurrency),
      }));
    }
    const diet = saved.dietaryPreferences;
    // UX-ONB-08: pre-fill the saved jobs so the steps are built from them (and
    // Continue on the first step re-saves them) instead of an empty answer.
    setJobsState(saved.jobs);
    setNumbersMode(effectiveNumbersMode(saved.numbersMode));
    if (profile) {
      setTrainingWeekdays(profile.trainingWeekdays);
      setGoal(knownGoal(profile.goal));
      const heightCm = profile.heightCm != null ? roundForDisplay(profile.heightCm) : null;
      const weightKg = profile.weightKg != null ? roundForDisplay(profile.weightKg) : null;
      setMetrics({
        biologicalSex: profile.biologicalSex ?? null,
        age: profile.age ?? null,
        heightCm,
        weightKg,
        activityLevel: profile.activityLevel ?? null,
      });
      setAgeText(profile.age != null ? String(profile.age) : '');
      const texts = bodyFieldTexts({ heightCm, weightKg }, units);
      setHeightText(texts.heightText);
      setInchesText(texts.inchesText);
      setWeightText(texts.weightText);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per saved payload; the starting units are read once
  }, [savedPrefs.data]);

  // The units flip on their own when typed digits fit the other system (below),
  // and the field texts are re-read right there. A units change from anywhere
  // ELSE (the How-you-cook chips, hydration) leaves the typed texts reading in
  // the wrong unit, so they are re-formatted from the stored cm / kg. This ref
  // marks the former so it is not re-formatted a second time.
  const unitsTextsHandled = useRef(false);
  const lastUnits = useRef(howYouCook.units);
  useEffect(() => {
    if (lastUnits.current === howYouCook.units) return;
    lastUnits.current = howYouCook.units;
    if (unitsTextsHandled.current) {
      unitsTextsHandled.current = false;
      return;
    }
    const texts = bodyFieldTexts(metrics, howYouCook.units);
    setHeightText(texts.heightText);
    setInchesText(texts.inchesText);
    setWeightText(texts.weightText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-format only when the units change
  }, [howYouCook.units]);

  // UX-ONB-01: the gate must not bounce the user straight back into the wizard
  // from the layout once they have been here this launch (see onboarding-gate).
  useEffect(() => {
    markOnboardingGateHandled(getToken());
  }, []);

  // UX-ONB-01: save every answer as it changes — the draft's existence is also
  // what resumes the wizard after a kill (see onboarding-draft.ts).
  const draftAnswers: OnboardingDraftAnswers = {
    step,
    jobs,
    trainingWeekdays,
    trainingDayKinds,
    howYouCook,
    goodFood,
    numbersMode,
    goal,
    metrics,
    ageText,
    heightText,
    inchesText,
    weightText,
    safety,
    cuisine,
  };
  const draftSnapshot = JSON.stringify(draftAnswers);
  useEffect(() => {
    if (finished.current || !persistDraft.current) return;
    writeOnboardingDraft(getToken(), draftAnswers);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the snapshot string is the change signal
  }, [draftSnapshot]);

  /** The setup is over (finished or skipped): the draft must not resume it again. */
  function finishSetup(completedJobs: readonly string[] = jobs) {
    // WP-13: once per onboarding — finish, train-only continue and "just looking" all end here.
    if (!finished.current) {
      trackOnboardingCompleted(completedJobs, [...new Set(Object.values(trainingDayKinds))]);
    }
    finished.current = true;
    clearOnboardingDraft();
  }

  const setJobsMutation = trpc.preferences.setJobs.useMutation({
    meta: { silent: true },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  // UX-ONB-09: every save mutation reports through the wizard's own error
  // line (saveAll's catch), so none of them raises the default snackbar too.
  const setDayKindsMutation = trpc.training.setDayKinds.useMutation({ meta: { silent: true } });
  const setShapeMutation = trpc.mealPlan.setShape.useMutation({ meta: { silent: true } });
  const setDisplayPrefsMutation = trpc.preferences.setDisplayPreferences.useMutation({
    meta: { silent: true },
  });
  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    meta: { silent: true },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const profileBasicsMutation = trpc.preferences.saveProfileBasics.useMutation({
    meta: { silent: true },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });
  const updateTargetsMutation = trpc.preferences.updateTargets.useMutation({
    meta: { silent: true },
  });
  const setNumbersModeMutation = trpc.preferences.setNumbersMode.useMutation({
    meta: { silent: true },
  });
  // R-18: the first week generates in the background AFTER onboarding has
  // already navigated to Today, so the dashboard cached at navigation time
  // says "nothing planned". Invalidate everything that reads the plan when the
  // generation lands (success or failure). These are mutation-level callbacks,
  // so they still fire after the wizard has unmounted.
  const generateMutation = trpc.mealPlan.generate.useMutation({
    onSuccess: (data) => trackPlanGenerated(data, 0),
    onSettled: () => {
      void utils.mealPlan.invalidate();
      void utils.dashboard.invalidate();
      void utils.shoppingList.invalidate();
    },
  });

  // Bug (UX-03): a step reached scrolled down (e.g. How you cook, which needs
  // scrolling to reach the auto-plan toggle) must not carry that offset into
  // the next step — a tap delivered before the correction lands on whatever
  // the stale offset put under it (on the goal step the first Continue could
  // miss "Lose Weight" and silently leave `goal` at null). The scroll view is
  // keyed on `step` below, so every step starts at the top (UX-ONB-07 moved
  // the wizard onto `KeyboardAwareScrollView`, which has no imperative ref).
  // UX-ONB-07: the table step's editor, asked before Continue leaves it.
  const householdRef = useRef<HouseholdEditorHandle>(null);

  // UX-ONB-01: Android hardware BACK steps back one question (first step: asks
  // before leaving). Focus-scoped, so it never swallows BACK on a screen pushed
  // over the wizard (gym setup, the legal pages).
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        // The nudge question comes after the save: BACK is "not now", not a step back.
        if (afterNudge) afterNudge();
        else if (step > 0) setStep((s) => s - 1);
        else setLeaveSheetOpen(true);
        return true;
      });
      return () => subscription.remove();
    }, [step, afterNudge]),
  );

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
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (afterNudge) return <NudgeStep onDone={afterNudge} />;

  // UX-ONB-08: the step list follows what is selected NOW (`jobs`, pre-filled
  // from the saved answer), never a stale copy of the previously saved jobs.
  const steps = onboardingSteps({
    intent: null,
    askIntent: false,
    isPremium,
    jobs,
    askJobs: true,
    hasNumericGoal: !goodFood && goal !== null,
  });
  const totalSteps = steps.length;
  const stepKey: OnboardingStepKey = steps[Math.min(step, totalSteps - 1)] ?? 'diet';
  const progress = onboardingProgress(steps, step);
  const progressPct = progress.percent ?? 0;
  // One flag for the whole multi-step save: the individual mutations' pending
  // flags drop between the awaits, which let a second Finish tap start a second save.
  const isSubmitting =
    saving ||
    setJobsMutation.isPending ||
    safetyMutation.isPending ||
    profileBasicsMutation.isPending ||
    setShapeMutation.isPending ||
    setDisplayPrefsMutation.isPending ||
    setNumbersModeMutation.isPending ||
    updateTargetsMutation.isPending;

  function handleAgeText(raw: string) {
    setAgeText(raw);
    const n = parseInt(raw, 10);
    setMetrics((m) => ({ ...m, age: raw === '' || isNaN(n) ? null : n }));
  }

  /**
   * §2.4, T-03.8 (bug B-43, AC11): after a height or weight field changes,
   * check whether the typed values (in the CURRENT units) fit the other system
   * far better — if so, switch `howYouCook.units` for the whole wizard and
   * re-interpret the SAME typed digits under the new unit (170 stays "170" but
   * now means 170 cm, not 170 in), so the stored heightCm/weightKg are never
   * briefly nonsense mid-switch. Imperial height is feet + inches (UX-ONB-05):
   * going imperial splits the typed total inches into the two fields.
   */
  function checkUnitSwitch(heightRaw: string, inchesRaw: string, weightRaw: string) {
    const currentUnits = howYouCook.units;
    const heightVal = heightValueForInference(heightRaw, inchesRaw, currentUnits);
    const weightVal = parseBodyNumber(weightRaw);
    const result = inferUnitsFromInput({
      heightValue: heightVal,
      weightValue: weightVal,
      currentUnits,
    });
    if (!result.shouldSwitch) return;
    const next = result.suggestedUnits;
    let nextHeight = heightRaw;
    let nextInches = '';
    if (next === 'IMPERIAL' && heightVal !== null) {
      const texts = bodyFieldTexts({ heightCm: inToCm(heightVal), weightKg: null }, 'IMPERIAL');
      nextHeight = texts.heightText;
      nextInches = texts.inchesText;
    }
    unitsTextsHandled.current = true;
    setHowYouCook((h) => ({ ...h, units: next }));
    setHeightText(nextHeight);
    setInchesText(nextInches);
    setMetrics((m) => ({
      ...m,
      ...(heightVal !== null && { heightCm: heightCmFromText(nextHeight, nextInches, next) }),
      ...(weightVal !== null && { weightKg: weightKgFromText(weightRaw, next) }),
    }));
    setUnitSwitchNotice({ from: currentUnits, heightText: heightRaw, inchesText: inchesRaw });
  }

  function handleHeightText(raw: string) {
    setHeightText(raw);
    setMetrics((m) => ({ ...m, heightCm: heightCmFromText(raw, inchesText, howYouCook.units) }));
    checkUnitSwitch(raw, inchesText, weightText);
  }
  function handleInchesText(raw: string) {
    setInchesText(raw);
    setMetrics((m) => ({ ...m, heightCm: heightCmFromText(heightText, raw, howYouCook.units) }));
    checkUnitSwitch(heightText, raw, weightText);
  }
  function handleWeightText(raw: string) {
    setWeightText(raw);
    setMetrics((m) => ({ ...m, weightKg: weightKgFromText(raw, howYouCook.units) }));
    checkUnitSwitch(heightText, inchesText, raw);
  }

  /** Reverts the units switch and restores the height as it was typed under the old unit. */
  function undoUnitSwitch() {
    if (!unitSwitchNotice) return;
    const { from, heightText: prevHeight, inchesText: prevInches } = unitSwitchNotice;
    unitsTextsHandled.current = true;
    setHowYouCook((h) => ({ ...h, units: from }));
    setHeightText(prevHeight);
    setInchesText(prevInches);
    setMetrics((m) => ({
      ...m,
      heightCm: heightCmFromText(prevHeight, prevInches, from) ?? m.heightCm,
      weightKg: weightKgFromText(weightText, from) ?? m.weightKg,
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
      // UX-ONB-05: only plausible values are stored ("1,80" must not save 1.8 cm).
      ...(metrics.heightCm !== null &&
        isPlausibleHeightCm(metrics.heightCm) && { heightCm: metrics.heightCm }),
      ...(metrics.weightKg !== null &&
        isPlausibleWeightKg(metrics.weightKg) && { weightKg: metrics.weightKg }),
      ...(metrics.activityLevel !== null && { activityLevel: metrics.activityLevel }),
    };
  }

  /**
   * Finish = save everything. Health fields (allergies/diets/dislikes, goal,
   * body metrics) go through the health consent guard: allowed (or already on
   * record) → saved; "Don't save it" → every OTHER answer is still saved and
   * the health fields are left out (AC2).
   */
  function handleFinish(safetyNow: SafetyValue = safety) {
    if (savingRef.current) return;
    setError(null);
    requestHealthConsent(() => void saveAll(true, safetyNow), {
      hasHealthData: hasAnySafetyTerm(safetyNow) || Object.keys(buildBasics()).length > 0,
      onDeclined: () => {
        setHealthDeclined('diet');
        void saveAll(false, safetyNow);
      },
    });
  }

  async function saveAll(includeHealth: boolean, safetyNow: SafetyValue) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
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
        await safetyMutation.mutateAsync(safetyNow);
        const basics = buildBasics();
        if (Object.keys(basics).length > 0) {
          await profileBasicsMutation.mutateAsync(basics);
        }
      }
      // WP-08: "Just protein" (or back to the full numbers) — only when it differs from
      // what is saved, and never for "Just good food", which shows no numbers at all.
      if (!goodFood && numbersMode !== effectiveNumbersMode(savedPrefs.data?.numbersMode)) {
        await setNumbersModeMutation.mutateAsync({ numbersMode });
      }
      if (isPremium && steps.includes('cuisine')) {
        await updateTargetsMutation.mutateAsync({
          cuisinePreferences: cuisine.cuisinePreferences,
          mealsPerDay: cuisine.mealsPerDay,
        });
      }
      finishSetup();
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();

      generateFirstWeek();
      const leave = () => {
        if (hasTrain) {
          // Train + food (AC3/AC9): a first week generates in the background
          // while the gym wizard opens pre-filled at step 2 (T-03.4 — the
          // days/pre-fill handling itself is L-GYM's setup-wizard, see the
          // final report).
          setMode('gym');
          router.replace('/today');
          const days = [...trainingWeekdays].sort((a, b) => a - b).join(',');
          router.push(`/gym/setup?from=onboarding${days ? `&days=${days}` : ''}`);
          return;
        }
        goToDashboard();
      };
      // UX-PO-08: the last question — an opt-in nudge — comes before leaving.
      setAfterNudge(() => leave);
    } catch (err) {
      // UX-ONB-09: never swallow — whichever step failed, say so and let the
      // user tap Finish again (every step is idempotent).
      setError(userFacingErrorMessage(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
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
      finishSetup();
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
            finishSetup(['PLAN_MEALS']);
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

  // UX-ONB-01: BACK (header arrow and Android hardware button alike) steps back
  // one question; on the first step it asks before leaving — it used to either
  // close the app (hardware BACK) or drop the user on an empty Today.
  function handleBack() {
    if (step > 0) {
      setStep((s) => s - 1);
      return;
    }
    setLeaveSheetOpen(true);
  }

  /** "Leave for now": the draft stays, so the next launch resumes the setup. */
  function leaveSetup() {
    setLeaveSheetOpen(false);
    markOnboardingGateHandled(getToken());
    goToDashboard();
  }

  function handleContinue() {
    setError(null);
    if (stepKey === 'jobs') {
      void handleJobsContinue();
      return;
    }
    // UX-ONB-07: a name typed into "Add someone" but never added is added first
    // (through the normal save, health consent included), then the wizard moves
    // on. If the add fails or is cancelled the step stays and shows why.
    if (stepKey === 'table' && householdRef.current?.hasPending()) {
      householdRef.current.addPending(() => advance());
      return;
    }
    // T-26.2: ask when leaving the step that holds health information, so the
    // sheet appears where the user just typed it. "Don't save it" discards
    // that step's health fields (they are never sent) and keeps the step open
    // with an amber notice — Continue again moves on.
    // UX-ACC-01: a term typed in "Something else?" but never added with "+" is
    // added first; one that needs a Keep/Remove choice holds Continue back.
    let safetyNow = safety;
    if (stepKey === 'diet') {
      const flushed = safetyPickerRef.current ? safetyPickerRef.current.flush() : safety;
      if (flushed === null) return;
      safetyNow = flushed;
    }
    if (stepKey === 'diet' && hasAnySafetyTerm(safetyNow)) {
      requestHealthConsent(() => advance(safetyNow), {
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
      requestHealthConsent(() => advance(), {
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
            setInchesText('');
            setWeightText('');
          }
          setHealthDeclined('body');
        },
      });
      return;
    }
    advance(safetyNow);
  }

  function advance(safetyNow: SafetyValue = safety) {
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
    } else {
      handleFinish(safetyNow);
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
        heightInchesText={inchesText}
        weightText={weightText}
        onAgeText={handleAgeText}
        onHeightText={handleHeightText}
        onHeightInchesText={handleInchesText}
        onWeightText={handleWeightText}
        units={howYouCook.units}
        // UX-ONB-06: Done on the last field (weight) is Continue.
        onSubmit={handleContinue}
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
          You can change this any time from Settings → Household.
        </Text>
        <HouseholdEditor variant="onboarding" handleRef={householdRef} />
      </View>
    );
  } else if (stepKey === 'diet') {
    content = (
      <View className="gap-3">
        <SafetyStep ref={safetyPickerRef} value={safety} onChange={setSafety} testIDPrefix="onb" />
        {healthDeclined === 'diet' && <HealthDeclinedNotice testID="onb-safety-declined" />}
      </View>
    );
  } else if (stepKey === 'howYouCook') {
    content = <HowYouCookStep value={howYouCook} onChange={setHowYouCook} isPremium={isPremium} />;
  } else if (stepKey === 'cuisine') {
    content = <CuisineStep value={cuisine} onChange={setCuisine} />;
  } else if (stepKey === 'targets') {
    content = (
      // WP-08: with "Just protein" picked, the targets step shows protein, not kcal.
      <NumbersModeProvider mode={numbersMode}>
        <TargetsCard previewKcal={previewTargetKcalFromBasics(metrics, goodFood ? null : goal)} />
      </NumbersModeProvider>
    );
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
        {/* WP-08: after the goal — what to keep an eye on. "Just good food" shows no numbers. */}
        {!goodFood && (
          <NumbersModeChoice
            value={numbersMode}
            onChange={setNumbersMode}
            testIDPrefix="onb-numbers"
          />
        )}
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
        : // R-02 / UX-ONB-05: an age under 16, or a height/weight outside the plausible
          // range, blocks the body-metrics step until fixed or cleared.
          stepKey === 'metrics'
          ? Object.values(metricsFieldErrors(metrics, howYouCook.units)).every((e) => e === null)
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
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
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
            : { min: 0, max: progress.total, now: step + 1 }
        }
        className="mx-4 mb-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
      </View>

      {/* UX-ONB-07: Continue is the scroll view's sticky footer, so it rises with
          the keyboard instead of hiding under it on every step with a field. */}
      <KeyboardAwareScrollView
        key={step}
        testID="onboarding-scroll"
        contentContainerClassName="gap-4 px-4 py-3 pb-8"
        footer={
          <View className="gap-2 border-t border-border bg-background px-4 pb-2 pt-3">
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
        }
      >
        {content}
        {error && (
          <View className="rounded-md bg-red-50 px-4 py-3">
            <Text className="text-sm text-red-600">{error}</Text>
          </View>
        )}
      </KeyboardAwareScrollView>
      {healthConsentSheet}
      <ConfirmSheet
        testID="onboarding-leave-confirm"
        visible={leaveSheetOpen}
        onClose={() => setLeaveSheetOpen(false)}
        title={ONBOARDING_COPY.leaveTitle}
        body={ONBOARDING_COPY.leaveBody}
        confirmLabel={ONBOARDING_COPY.leaveConfirm}
        cancelLabel={ONBOARDING_COPY.leaveCancel}
        onConfirm={leaveSetup}
      />
    </Screen>
  );
}
