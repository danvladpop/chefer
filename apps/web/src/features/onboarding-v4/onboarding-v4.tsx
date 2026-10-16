'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAiConsent, useAiConsentOpen } from '@/features/ai-consent/AiConsentProvider';
import {
  EMPTY_WIZARD_DATA,
  type ActivityLevel,
  type Goal,
  type WizardData,
} from '@/features/onboarding/types';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { trackOnboardingCompleted } from '@/lib/analytics-events';
import { trpc } from '@/lib/trpc';
import {
  bodyMetricsAgeError,
  isPlausibleHeightCm,
  isPlausibleWeightKg,
  type BodyUnits,
  type OnboardingJob,
} from '@chefer/types';
import {
  activityFromTrainingDays,
  aiConsentRequiredFor,
  cn,
  defaultsForRegion,
  detectRegion,
  eatsEverything,
  EMPTY_SAFETY_VALUE,
  ONBOARDING_V4_COPY,
  onboardingV4Progress,
  onboardingV4Steps,
  previewTargetKcalFromBasics,
  userFacingErrorMessage,
  type OnboardingV4Step,
  type SafetyPickerValue,
} from '@chefer/utils';
import { aboutYouErrors, StepAboutYou, type AboutYouValue } from './components/step-about-you';
import { StepPremium } from './components/step-premium';
import { StepSafety } from './components/step-safety';
import { StepGoalV4, StepJobsV4, type GoalChoice } from './components/step-tiles';
import { StepTrain } from './components/step-train';
import { StepBuilding, StepReady, type BuildStatus } from './components/step-week';
import { ErrorLine, PrimaryButton, V4TopBar } from './components/ui';
import { markWelcomePending, type WelcomeKind } from './welcome-card';

// ─── Onboarding V4 (flag `onboardingV4`, docs/onboarding-review-2026-10) ──────
// The short, Biscuit-led setup: jobs → goal → about you → [safety] →
// [building → ready] → [premium] → [train] (shared onboardingV4Steps, so web
// and mobile route identically). Saves go through the same procedures, health
// consent guard and AI consent guard as the current wizard
// (features/onboarding/components/onboarding-wizard.tsx):
//   - health fields (goal + body on About you, the safety lists) are asked for
//     where they were typed; "Don't save it" on About you continues with the
//     defaults and stores none of them; on Safety it clears the picks and
//     keeps the step open with the notice, like the current wizard's diet step;
//   - everything is saved when the LAST question step is left, in the current
//     wizard's order (setJobs → display units → updateSafety → profile basics),
//     so the first week is generated from the saved answers;
//   - the first week is generated and WAITED for (Building), then shown (Ready).

/** Steps that keep the top bar (back + progress) — the questions. */
const QUESTION_STEPS: readonly OnboardingV4Step[] = ['jobs', 'goal', 'aboutYou', 'safety'];

const TILE_GOALS: readonly (Goal | null)[] = ['LOSE_WEIGHT', 'GAIN_MUSCLE', 'EAT_HEALTHIER'];

function initialUnits(saved: BodyUnits | null | undefined): BodyUnits {
  if (saved) return saved;
  return defaultsForRegion(
    detectRegion(typeof navigator === 'undefined' ? [] : navigator.languages),
  ).preferredUnits;
}

export function OnboardingV4({
  isPremium,
  initialData = EMPTY_WIZARD_DATA,
  initialJobs = [],
  savedUnits = null,
}: {
  isPremium: boolean;
  /** Saved preferences, so a re-run never starts blank (F-ONB-1-1). */
  initialData?: WizardData;
  initialJobs?: OnboardingJob[];
  /** The saved unit preference; null → the device region's default. */
  savedUnits?: BodyUnits | null;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const requestAiConsent = useAiConsent();
  const aiConsentOpen = useAiConsentOpen();
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();

  const [jobs, setJobs] = useState<OnboardingJob[]>(initialJobs);
  const [goal, setGoal] = useState<GoalChoice>(
    TILE_GOALS.includes(initialData.goal) ? initialData.goal : undefined,
  );
  const [about, setAbout] = useState<AboutYouValue>({
    biologicalSex: initialData.biologicalSex,
    age: initialData.age,
    heightCm: initialData.heightCm,
    weightKg: initialData.weightKg,
  });
  const [units] = useState<BodyUnits>(() => initialUnits(savedUnits));
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [explicitActivity, setExplicitActivity] = useState<ActivityLevel | null>(
    initialData.activityLevel,
  );
  const [safety, setSafety] = useState<SafetyPickerValue>({
    dietaryRestrictions: initialData.dietaryRestrictions,
    allergies: initialData.allergies,
    dislikedIngredients: initialData.dislikedIngredients,
  });
  const [safetyDeclined, setSafetyDeclined] = useState(false);
  /** About you's consent answer: whether goal + body are saved. */
  const [includeBody, setIncludeBody] = useState(true);

  const [step, setStep] = useState<OnboardingV4Step>('jobs');
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('running');
  // Refs, not state: finish() can run in the same tick that sets them.
  const planned = useRef(false);
  const trainReady = useRef(false);
  const completedTracked = useRef(false);

  const steps = onboardingV4Steps({ jobs, isPremium });
  const progress = onboardingV4Progress(step, steps);
  const hasTrain = jobs.includes('TRAIN');
  const activity: ActivityLevel =
    explicitActivity ?? activityFromTrainingDays(hasTrain ? weekdays.length : null);
  const numericGoal = goal ?? null;
  const targetKcal = previewTargetKcalFromBasics(
    {
      age: about.age,
      heightCm:
        about.heightCm !== null && isPlausibleHeightCm(about.heightCm) ? about.heightCm : null,
      weightKg:
        about.weightKg !== null && isPlausibleWeightKg(about.weightKg) ? about.weightKg : null,
      activityLevel: activity,
      biologicalSex: about.biologicalSex,
    },
    numericGoal,
  );

  // Every save reports through the error line, so none raises the default toast too.
  const setJobsMutation = trpc.preferences.setJobs.useMutation({ meta: { silent: true } });
  const setDisplayPrefsMutation = trpc.preferences.setDisplayPreferences.useMutation({
    meta: { silent: true },
  });
  const safetyMutation = trpc.preferences.updateSafety.useMutation({ meta: { silent: true } });
  const profileBasicsMutation = trpc.preferences.saveProfileBasics.useMutation({
    meta: { silent: true },
  });
  // R-18: everything that reads the plan refreshes when the week lands.
  const generateMutation = trpc.mealPlan.generate.useMutation({
    meta: { silent: true },
    onSettled: () => {
      void utils.mealPlan.invalidate();
      void utils.dashboard.invalidate();
      void utils.shoppingList.invalidate();
    },
  });

  function go(next: OnboardingV4Step | undefined, dir: 'forward' | 'back' = 'forward') {
    setError(null);
    setDirection(dir);
    if (next === undefined) {
      finish();
      return;
    }
    setStep(next);
    if (next === 'building') startBuilding();
  }
  const stepAfter = (s: OnboardingV4Step) => steps[steps.indexOf(s) + 1];

  // ── Building: generate the first week and wait for it ────────────────────────
  const generationStarted = useRef(false);
  function startBuilding() {
    setBuildStatus('running');
    generationStarted.current = false;
    const run = () => {
      generationStarted.current = true;
      generateMutation
        .mutateAsync({ weekOffset: 0 })
        .then(() => {
          planned.current = true;
          setStep('ready');
        })
        .catch(() => setBuildStatus('failed'));
    };
    requestAiConsent('meal-plan', run, { usesAi: aiConsentRequiredFor('meal-plan', isPremium) });
  }
  // AI consent "Not now" sends nothing and never blocks onboarding (UX-03 AC7):
  // the sheet closed without starting generation → skip the reveal.
  const consentWasOpen = useRef(false);
  useEffect(() => {
    if (consentWasOpen.current && !aiConsentOpen && step === 'building') {
      if (!generationStarted.current) go(stepAfter('ready'));
    }
    consentWasOpen.current = aiConsentOpen;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the sheet closing only
  }, [aiConsentOpen]);

  // ── Saves ────────────────────────────────────────────────────────────────────
  /** Goal + body fields to store (health information — T-26.2). */
  function buildBasics() {
    const hasBody =
      about.biologicalSex !== null ||
      about.age !== null ||
      about.heightCm !== null ||
      about.weightKg !== null;
    return {
      ...(goal !== undefined && goal !== null && { goal }),
      ...(about.biologicalSex !== null && { biologicalSex: about.biologicalSex }),
      ...(about.age !== null && bodyMetricsAgeError(about.age) === null && { age: about.age }),
      ...(about.heightCm !== null &&
        isPlausibleHeightCm(about.heightCm) && { heightCm: about.heightCm }),
      ...(about.weightKg !== null &&
        isPlausibleWeightKg(about.weightKg) && { weightKg: about.weightKg }),
      ...((hasBody || explicitActivity !== null) && { activityLevel: activity }),
    };
  }

  async function saveAll(withBody: boolean, withSafety: boolean, after: OnboardingV4Step) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await setJobsMutation.mutateAsync({
        jobs,
        ...(hasTrain && weekdays.length > 0 && { trainingWeekdays: weekdays }),
      });
      await setDisplayPrefsMutation.mutateAsync({ preferredUnits: units });
      // Declined health consent: nothing health-related is sent at all.
      if (withSafety) await safetyMutation.mutateAsync(safety);
      if (withBody) {
        const basics = buildBasics();
        if (Object.keys(basics).length > 0) await profileBasicsMutation.mutateAsync(basics);
      }
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();
      go(stepAfter(after));
    } catch (err) {
      // UX-ONB-09: say which save failed; Continue again retries (every save is idempotent).
      setError(userFacingErrorMessage(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function continueJobs() {
    if (jobs.length === 0 || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await setJobsMutation.mutateAsync({ jobs });
      go('goal');
    } catch (err) {
      setError(userFacingErrorMessage(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function continueAboutYou() {
    const after = (withBody: boolean) => {
      setIncludeBody(withBody);
      if (steps.includes('safety')) go('safety');
      else void saveAll(withBody, false, 'aboutYou');
    };
    requestHealthConsent(() => after(true), {
      hasHealthData: Object.keys(buildBasics()).length > 0,
      // "Not now — use defaults": carry on, store no goal or body fields.
      onDeclined: () => after(false),
    });
  }

  function continueSafety() {
    setSafetyDeclined(false);
    requestHealthConsent(() => void saveAll(includeBody, true, 'safety'), {
      hasHealthData: !eatsEverything(safety),
      onDeclined: () => {
        setSafety(EMPTY_SAFETY_VALUE);
        setSafetyDeclined(true);
      },
    });
  }

  function handleContinue() {
    setError(null);
    if (step === 'jobs') void continueJobs();
    else if (step === 'goal') go('aboutYou');
    else if (step === 'aboutYou') continueAboutYou();
    else if (step === 'safety') continueSafety();
  }

  function handleBack() {
    const i = steps.indexOf(step);
    if (i <= 0) router.push('/dashboard');
    else go(steps[i - 1], 'back');
  }

  function canContinue(): boolean {
    if (step === 'jobs') return jobs.length > 0;
    if (step === 'goal') return goal !== undefined;
    if (step === 'aboutYou') {
      const e = aboutYouErrors(about, units);
      return e.age === null && e.height === null && e.weight === null;
    }
    return true;
  }

  function finish() {
    if (!completedTracked.current) {
      completedTracked.current = true;
      trackOnboardingCompleted(jobs, []);
    }
    const kind: WelcomeKind =
      planned.current && trainReady.current
        ? 'both'
        : planned.current
          ? 'food'
          : trainReady.current
            ? 'train'
            : 'none';
    markWelcomePending(kind);
    void utils.preferences.invalidate();
    void utils.dashboard.invalidate();
    const trainOnly = jobs.length === 1 && jobs[0] === 'TRAIN';
    router.push(trainOnly ? '/gym' : '/dashboard');
  }

  const isQuestion = QUESTION_STEPS.includes(step);
  const continueLabel =
    step === 'safety' && stepAfter('safety') === 'building'
      ? ONBOARDING_V4_COPY.safetyBuild
      : step === 'safety'
        ? ONBOARDING_V4_COPY.safetyContinue
        : ONBOARDING_V4_COPY.continue;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-revamp-canvas text-revamp-label">
      {isQuestion && (
        <div className="px-4 pt-2">
          <div className="mx-auto max-w-md">
            <V4TopBar progress={progress} onBack={handleBack} backDisabled={saving} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col px-4 py-4 sm:py-8">
        {/* MO-09: steps slide in the direction of travel (crossfade under reduced motion, globals.css). */}
        <div
          key={step}
          data-testid={`onb-v4-step-${step}`}
          className={cn(
            'mx-auto flex w-full max-w-md flex-1 flex-col gap-4 duration-base ease-enter animate-in fade-in-0',
            direction === 'forward' ? 'slide-in-from-right-6' : 'slide-in-from-left-6',
          )}
        >
          {error && <ErrorLine message={error} />}

          {step === 'jobs' && <StepJobsV4 value={jobs} onChange={setJobs} />}
          {step === 'goal' && <StepGoalV4 value={goal} onChange={setGoal} />}
          {step === 'aboutYou' && (
            <StepAboutYou
              units={units}
              value={about}
              onChange={setAbout}
              showTrainingDays={hasTrain}
              weekdays={weekdays}
              onWeekdaysChange={setWeekdays}
              activity={activity}
              onActivityChange={setExplicitActivity}
              targetKcal={targetKcal}
              showTarget={goal !== null}
            />
          )}
          {step === 'safety' && (
            <StepSafety value={safety} onChange={setSafety} declined={safetyDeclined} />
          )}
          {step === 'building' && (
            <StepBuilding
              kcal={goal === null ? null : targetKcal}
              status={buildStatus}
              onRetry={startBuilding}
              onSkip={() => go(stepAfter('ready'))}
            />
          )}
          {step === 'ready' && <StepReady onContinue={() => go(stepAfter('ready'))} />}
          {step === 'premium' && (
            <StepPremium jobs={jobs} onContinue={() => go(stepAfter('premium'))} />
          )}
          {step === 'train' && (
            <StepTrain
              weekdays={weekdays}
              units={units}
              onDone={() => {
                trainReady.current = true;
                go(stepAfter('train'));
              }}
            />
          )}
        </div>
      </div>

      {isQuestion && (
        <div className="sticky bottom-0 z-10 bg-revamp-canvas px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5">
          <div className="mx-auto max-w-md">
            <PrimaryButton
              onClick={handleContinue}
              disabled={!canContinue()}
              busy={saving}
              testId="onb-v4-continue"
            >
              {continueLabel}
            </PrimaryButton>
          </div>
        </div>
      )}
      {healthConsentSheet}
    </div>
  );
}
