'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAiConsent } from '@/features/ai-consent/AiConsentProvider';
import { HouseholdSection } from '@/features/preferences/components/household-section';
import { TargetsCard } from '@/features/preferences/components/TargetsCard';
import { UpgradeCard } from '@/features/premium/components/UpgradeButton';
import {
  HEALTH_DECLINED_BODY_NOTICE,
  HealthDeclinedNotice,
} from '@/features/privacy/components/HealthDeclinedNotice';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { trpc } from '@/lib/trpc';
import type { OnboardingJob } from '@chefer/types';
import { aiConsentRequiredFor, onboardingProgress, onboardingSteps } from '@chefer/utils';
import { EMPTY_WIZARD_DATA, type Goal, type WizardData } from '../types';
import { StepCuisine } from './step-cuisine';
import { StepDiet } from './step-diet';
import { StepGoal } from './step-goal';
import { StepHowYouCook, type HowYouCookStepValue } from './step-how-you-cook';
import { StepJobs } from './step-jobs';
import { StepMetrics } from './step-metrics';
import { StepTrainingDays, type TrainingDayKind } from './step-training-days';

// ─── Wizard Component (§2.4, T-03.6, rev 2) ────────────────────────────────────
// v3, jobs-based (mirrors the mobile wizard — same shared `onboardingSteps`/
// `effectiveJobs` from @chefer/utils, so web and mobile route identically).
// Step 1 replaces "What brings you here?" with a multi-select "What should
// Chefer help with?" (StepJobs). Train alone hands off to gym setup
// unchanged; any food job gets Diet -> How you cook -> Goal -> Body metrics
// (+ Targets for Track or Train with a numeric goal), premium adds Cuisine
// at the end. Every tier saves through the free-for-every-tier granular
// procedures — the old premium/free branch collapses into one builder.

const EMPTY_HOW_YOU_COOK: HowYouCookStepValue = {
  shape: null,
  currency: 'EUR',
  units: 'METRIC',
  autoPlanWeekly: false,
};

function stepTitle(key: string): string {
  switch (key) {
    case 'jobs':
      return 'What should Chefer help with?';
    case 'trainingDays':
      return 'Training days';
    case 'table':
      return "Who's at your table?";
    case 'diet':
      return 'Diet & restrictions';
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
    default:
      return '';
  }
}

export function OnboardingWizard({
  isPremium,
  initialData = EMPTY_WIZARD_DATA,
  initialJobs = [],
}: {
  isPremium: boolean;
  /** Saved preferences, so a re-run never starts blank (F-ONB-1-1). */
  initialData?: WizardData;
  /** The saved effective jobs list; [] asks the question. */
  initialIntent?: unknown;
  initialJobs?: OnboardingJob[];
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestAiConsent = useAiConsent();
  // T-26.2 (UX-26): allergies/diets, goal and body metrics are health information —
  // asked once, the first time a step holding any of them is continued. SEPARATE
  // from the AI consent above (which still guards the first-week generation).
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();
  const [healthDeclined, setHealthDeclined] = useState<'diet' | 'body' | null>(null);

  const [askJobs] = useState(initialJobs.length === 0);
  const [jobs, setJobs] = useState<OnboardingJob[]>(askJobs ? [] : initialJobs);
  const [trainingWeekdays, setTrainingWeekdays] = useState<number[]>([]);
  const [trainingDayKinds, setTrainingDayKinds] = useState<Record<number, TrainingDayKind>>({});
  const [howYouCook, setHowYouCook] = useState<HowYouCookStepValue>(EMPTY_HOW_YOU_COOK);
  const [goodFood, setGoodFood] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WizardData>(initialData);

  const steps = onboardingSteps({
    intent: null,
    askIntent: false,
    isPremium,
    jobs: askJobs ? jobs : initialJobs,
    askJobs: true,
    hasNumericGoal: !goodFood && data.goal !== null,
  });
  const totalSteps = steps.length;
  const stepKey = steps[step - 1] ?? steps[steps.length - 1] ?? 'jobs';

  const setJobsMutation = trpc.preferences.setJobs.useMutation({
    onError: (err) => setError(err.message),
  });
  const setDayKindsMutation = trpc.training.setDayKinds.useMutation();
  const setShapeMutation = trpc.mealPlan.setShape.useMutation();
  const setDisplayPrefsMutation = trpc.preferences.setDisplayPreferences.useMutation();
  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    onError: (err) => setError(err.message),
  });
  const profileBasicsMutation = trpc.preferences.saveProfileBasics.useMutation({
    onError: (err) => setError(err.message),
  });
  const updateTargetsMutation = trpc.preferences.updateTargets.useMutation();
  // R-18: the first week generates in the background AFTER the wizard has
  // navigated away, so the dashboard cached at navigation time says "nothing
  // planned". Invalidate everything that reads the plan when generation lands.
  const generateMutation = trpc.mealPlan.generate.useMutation({
    onSettled: () => {
      void utils.mealPlan.invalidate();
      void utils.dashboard.invalidate();
      void utils.shoppingList.invalidate();
    },
  });

  const hasTrain = jobs.includes('TRAIN');

  function generateFirstWeek() {
    const run = () => generateMutation.mutate({ weekOffset: 0 });
    requestAiConsent('meal-plan', run, { usesAi: aiConsentRequiredFor('meal-plan', isPremium) });
  }

  function canContinue(): boolean {
    if (stepKey === 'jobs') return jobs.length > 0;
    return true; // every later step is independently optional
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
      router.push('/gym/setup');
      return;
    }
    setStep((s) => s + 1);
  }

  function handleSkip() {
    // "Just looking around" (jobs step only) — saves PLAN_MEALS and lands
    // on the dashboard directly; every later step is already optional.
    if (stepKey === 'jobs') {
      setJobs(['PLAN_MEALS']);
      setJobsMutation.mutate(
        { jobs: ['PLAN_MEALS'] },
        {
          onSuccess: () => {
            void utils.preferences.invalidate();
            router.push('/dashboard');
          },
        },
      );
      return;
    }
    handleFinish();
  }

  function handleBack() {
    if (step > 1) {
      setStep((s) => s - 1);
    } else {
      router.push('/dashboard');
    }
  }

  /** The goal + body fields to store (health information — T-26.2). */
  function buildBasics() {
    return {
      ...(!goodFood && data.goal !== null && { goal: data.goal }),
      ...(data.biologicalSex !== null && { biologicalSex: data.biologicalSex }),
      ...(data.age !== null && data.age > 0 && { age: data.age }),
      ...(data.heightCm !== null && data.heightCm > 0 && { heightCm: data.heightCm }),
      ...(data.weightKg !== null && data.weightKg > 0 && { weightKg: data.weightKg }),
      ...(data.activityLevel !== null && { activityLevel: data.activityLevel }),
    };
  }
  const hasSafetyTerms =
    data.allergies.length + data.dietaryRestrictions.length + data.dislikedIngredients.length > 0;

  /**
   * Finish = save everything. Health fields go through the health consent
   * guard: allowed (or already on record) → saved; "Don't save it" → every
   * OTHER answer is still saved and the health fields are left out (AC2).
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
        await setDayKindsMutation.mutateAsync({ days: trainingDayKinds });
      }
      if (steps.includes('howYouCook') && howYouCook.shape) {
        await setShapeMutation.mutateAsync(howYouCook.shape);
        await setDisplayPrefsMutation.mutateAsync({
          preferredUnits: howYouCook.units,
          currency: howYouCook.currency,
        });
      }
      // With health left out (declined) nothing health-related is sent at all.
      if (includeHealth) {
        await safetyMutation.mutateAsync({
          dietaryRestrictions: data.dietaryRestrictions,
          allergies: data.allergies,
          dislikedIngredients: data.dislikedIngredients,
        });
        const basics = buildBasics();
        if (Object.keys(basics).length > 0) {
          await profileBasicsMutation.mutateAsync(basics);
        }
      }
      if (isPremium && steps.includes('cuisine')) {
        await updateTargetsMutation.mutateAsync({
          cuisinePreferences: data.cuisinePreferences,
          mealsPerDay: data.mealsPerDay,
        });
      }
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();

      if (hasTrain) {
        generateFirstWeek();
        const days = [...trainingWeekdays].sort((a, b) => a - b).join(',');
        router.push(`/gym/setup?from=onboarding${days ? `&days=${days}` : ''}`);
        return;
      }
      generateFirstWeek();
      router.push('/dashboard');
    } catch {
      // onError already surfaced the message.
    }
  }

  function handleContinue() {
    setError(null);
    if (stepKey === 'jobs') {
      void handleJobsContinue();
      return;
    }
    // T-26.2: ask when leaving the step that holds health information, so the
    // sheet appears where the user just typed it. "Don't save it" discards that
    // step's health fields (never sent) and keeps the step open with an amber
    // notice — Continue again moves on.
    if (stepKey === 'diet' && hasSafetyTerms) {
      requestHealthConsent(advance, {
        onDeclined: () => {
          setData((d) => ({
            ...d,
            dietaryRestrictions: [],
            allergies: [],
            dislikedIngredients: [],
          }));
          setHealthDeclined('diet');
        },
      });
      return;
    }
    const bodyStepHasData =
      (stepKey === 'goal' && !goodFood && data.goal !== null) ||
      (stepKey === 'metrics' &&
        [data.biologicalSex, data.age, data.heightCm, data.weightKg, data.activityLevel].some(
          (v) => v !== null,
        ));
    if (bodyStepHasData) {
      requestHealthConsent(advance, {
        onDeclined: () => {
          setData((d) =>
            stepKey === 'goal'
              ? { ...d, goal: null }
              : {
                  ...d,
                  biologicalSex: null,
                  age: null,
                  heightCm: null,
                  weightKg: null,
                  activityLevel: null,
                },
          );
          setHealthDeclined('body');
        },
      });
      return;
    }
    advance();
  }

  function advance() {
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  }

  const progress = onboardingProgress(steps, step - 1);
  const progressPct = progress.percent ?? 0;
  const isSubmitting =
    setJobsMutation.isPending ||
    safetyMutation.isPending ||
    profileBasicsMutation.isPending ||
    setShapeMutation.isPending ||
    setDisplayPrefsMutation.isPending ||
    updateTargetsMutation.isPending;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {/* ── Progress bar ── */}
      <div className="border-b bg-background px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span data-testid="onboarding-title">{stepTitle(stepKey)}</span>
            <span>
              {progress.percent === null
                ? progress.label
                : `${progress.label} · ${progress.percent}%`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={progress.total === null ? undefined : step}
              aria-valuemin={1}
              aria-valuemax={progress.total ?? undefined}
              aria-valuetext={progress.label}
            />
          </div>
        </div>
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 px-4 py-6 sm:py-10">
        <div className="mx-auto max-w-2xl">
          {error && (
            <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {stepKey === 'jobs' && <StepJobs value={jobs} onChange={setJobs} />}

          {stepKey === 'trainingDays' && (
            <StepTrainingDays
              weekdays={trainingWeekdays}
              onWeekdaysChange={setTrainingWeekdays}
              dayKinds={trainingDayKinds}
              onDayKindsChange={setTrainingDayKinds}
              onNotSure={() => setStep((s) => s + 1)}
            />
          )}

          {stepKey === 'table' && (
            <div className="space-y-6">
              <div className="space-y-1 text-center">
                <h1 className="text-2xl font-bold tracking-tight">Who&apos;s at your table?</h1>
                <p className="text-sm text-muted-foreground">
                  Add the people you cook for. Their allergies and restrictions apply to every plan
                  — free. You can change this any time in Preferences.
                </p>
              </div>
              <HouseholdSection
                isPremium={isPremium}
                ownerSafety={{
                  allergies: data.allergies,
                  dietaryRestrictions: data.dietaryRestrictions,
                }}
                variant="onboarding"
              />
            </div>
          )}

          {stepKey === 'diet' && (
            <StepDiet
              value={{
                dietaryRestrictions: data.dietaryRestrictions,
                allergies: data.allergies,
                dislikedIngredients: data.dislikedIngredients,
              }}
              onChange={(diet) => setData((d) => ({ ...d, ...diet }))}
            />
          )}
          {stepKey === 'diet' && healthDeclined === 'diet' && (
            <div className="mt-4">
              <HealthDeclinedNotice testId="onb-safety-declined" />
            </div>
          )}

          {stepKey === 'howYouCook' && (
            <StepHowYouCook value={howYouCook} onChange={setHowYouCook} isPremium={isPremium} />
          )}

          {stepKey === 'goal' && (
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Optional — skip if you just want chef-picked meals.
              </p>
              <StepGoal
                value={goodFood ? null : data.goal}
                onChange={(goal: Goal) => {
                  setGoodFood(false);
                  setData((d) => ({ ...d, goal }));
                }}
                showGoodFood
                goodFood={goodFood}
                onGoodFood={() => setGoodFood(true)}
              />
              {healthDeclined === 'body' && (
                <HealthDeclinedNotice
                  testId="onb-body-declined"
                  message={HEALTH_DECLINED_BODY_NOTICE}
                />
              )}
            </div>
          )}

          {stepKey === 'metrics' && (
            <div className="space-y-8">
              <div className="space-y-4">
                <p className="text-center text-sm text-muted-foreground">
                  Optional — with these, your calorie target is computed from your body instead of a
                  default.
                </p>
                <StepMetrics
                  value={{
                    biologicalSex: data.biologicalSex,
                    age: data.age,
                    heightCm: data.heightCm,
                    weightKg: data.weightKg,
                    activityLevel: data.activityLevel,
                  }}
                  onChange={(metrics) => setData((d) => ({ ...d, ...metrics }))}
                  goal={goodFood ? null : data.goal}
                />
                {healthDeclined === 'body' && (
                  <HealthDeclinedNotice
                    testId="onb-body-declined"
                    message={HEALTH_DECLINED_BODY_NOTICE}
                  />
                )}
              </div>
              {!isPremium && (
                <UpgradeCard
                  source="onboarding"
                  title="Want every week generated around this profile?"
                  description="Free plans are chef-picked and always respect your allergies. Premium — free for now — has the AI chef build each week around your goal, targets and taste."
                  perkDisplay="carousel"
                />
              )}
            </div>
          )}

          {stepKey === 'targets' && <TargetsCard />}

          {stepKey === 'cuisine' && (
            <StepCuisine
              value={{
                cuisinePreferences: data.cuisinePreferences,
                mealsPerDay: data.mealsPerDay,
              }}
              onChange={(cuisine) => setData((d) => ({ ...d, ...cuisine }))}
              showHouseholdHint={false}
            />
          )}
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="sticky bottom-0 z-10 border-t bg-background px-4 py-4 pb-safe">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={isSubmitting}
            className="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <div className="flex items-center gap-4">
            {stepKey === 'jobs' && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting}
                className="min-h-11 px-2 text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Just looking around
              </button>
            )}
            <button
              type="button"
              data-testid="onboarding-continue"
              onClick={handleContinue}
              disabled={!canContinue() || isSubmitting}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? 'Saving…'
                : stepKey === 'jobs'
                  ? `Continue — ${jobs.length} selected`
                  : step === totalSteps
                    ? hasTrain
                      ? 'Next: set up training'
                      : 'Plan my first week'
                    : 'Continue'}
            </button>
          </div>
        </div>
      </div>
      {healthConsentSheet}
    </div>
  );
}
