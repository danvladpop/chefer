'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { HouseholdSection } from '@/features/preferences/components/household-section';
import { UpgradeCard } from '@/features/premium/components/UpgradeButton';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import type { OnboardingIntent } from '@chefer/types';
import { onboardingProgress, onboardingSteps } from '@chefer/utils';
import { EMPTY_WIZARD_DATA, type Goal, type WizardData } from '../types';
import { StepCuisine } from './step-cuisine';
import { StepDiet } from './step-diet';
import { StepGoal } from './step-goal';
import { StepIntent } from './step-intent';
import { StepMetrics } from './step-metrics';

// ─── Wizard Component ─────────────────────────────────────────────────────────
// Premium: 4 steps (goal → metrics → diet → cuisine) saved via
// preferences.setup. Free (P1-2 + ux-fixes-plan.md 3.1): 3 steps — safety
// (free preferences.updateSafety), then OPTIONAL goal and body metrics
// (preferences.saveProfileBasics, free tier stores them so the dashboard
// target is real). The old step 2 was a premium pitch masquerading as
// onboarding progress (review O-1); the pitch is now a card under step 3.
//
// Step 0 (backlog P2-3, audit F-PM-6): "What brings you here?" — asked while
// the profile has no intent. Households get "Who's at your table?" before the
// food steps; gym-goers go straight to gym setup (food setup later — opening
// /onboarding again skips the question). The step list comes from the shared
// `onboardingSteps`, so web and mobile route identically. There is no
// serving-size question any more: the household is the one people model.

export function OnboardingWizard({
  isPremium,
  initialData = EMPTY_WIZARD_DATA,
  initialIntent = null,
}: {
  isPremium: boolean;
  /** Saved preferences, so a re-run never starts blank (F-ONB-1-1). */
  initialData?: WizardData;
  /** The saved onboarding intent; null asks the question. */
  initialIntent?: OnboardingIntent | null;
}) {
  const router = useRouter();
  const [askIntent] = useState(initialIntent === null);
  const [intent, setIntent] = useState<OnboardingIntent | null>(initialIntent);
  const steps = onboardingSteps({ intent, askIntent, isPremium });
  const totalSteps = steps.length;
  // 1-based position in `steps` (kept 1-based so progress reads naturally).
  const [step, setStep] = useState(1);
  const stepKey = steps[step - 1] ?? steps[steps.length - 1];
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WizardData>(initialData);

  const intentMutation = trpc.preferences.setIntent.useMutation({
    onError: (err) => setError(err.message),
  });

  const setupMutation = trpc.preferences.setup.useMutation({
    onSuccess: () => router.push('/dashboard'),
    onError: (err) => setError(err.message),
  });

  const safetyMutation = trpc.preferences.updateSafety.useMutation({
    onError: (err) => setError(err.message),
  });

  // Free tier: goal + metrics are optional but storable (3.1) — saved in the
  // same finish action as safety, then straight to the dashboard.
  const profileBasicsMutation = trpc.preferences.saveProfileBasics.useMutation({
    onError: (err) => setError(err.message),
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  function canContinue(): boolean {
    if (stepKey === 'intent') return intent !== null;
    if (!isPremium) return true; // every free step is optional
    if (stepKey === 'goal') return data.goal !== null;
    if (stepKey === 'metrics')
      return (
        data.biologicalSex !== null &&
        data.age !== null &&
        data.age > 0 &&
        data.heightCm !== null &&
        data.heightCm > 0 &&
        data.weightKg !== null &&
        data.weightKg > 0 &&
        data.activityLevel !== null
      );
    return true; // Diet, cuisine and the table are optional
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function stepIndexOf(key: (typeof steps)[number]): number {
    const index = steps.indexOf(key);
    return index >= 0 ? index + 1 : 1;
  }

  async function handleIntentContinue() {
    if (intent === null) return;
    try {
      await intentMutation.mutateAsync({ intent });
    } catch {
      return; // onError surfaced it
    }
    capture('onboarding_intent', { intent });
    if (intent === 'TRAIN') {
      // Gym-goers set up training first; food setup can wait (F-PM-6).
      router.push('/gym/setup');
      return;
    }
    setStep((s) => s + 1);
  }

  function handleContinue() {
    setError(null);
    if (stepKey === 'intent') {
      void handleIntentContinue();
      return;
    }
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      void handleFinish();
    }
  }

  /** "Skip this question": no intent stored, the solo flow continues. */
  function handleSkipIntent() {
    setError(null);
    setIntent(null);
    setStep((s) => s + 1);
  }

  function handleBack() {
    if (step > 1) {
      setStep((s) => s - 1);
    } else {
      router.push('/dashboard');
    }
  }

  async function handleFinish() {
    if (!isPremium) {
      try {
        await safetyMutation.mutateAsync({
          dietaryRestrictions: data.dietaryRestrictions,
          allergies: data.allergies,
          dislikedIngredients: data.dislikedIngredients,
        });
        const basics = {
          ...(data.goal !== null && { goal: data.goal }),
          ...(data.biologicalSex !== null && { biologicalSex: data.biologicalSex }),
          ...(data.age !== null && data.age > 0 && { age: data.age }),
          ...(data.heightCm !== null && data.heightCm > 0 && { heightCm: data.heightCm }),
          ...(data.weightKg !== null && data.weightKg > 0 && { weightKg: data.weightKg }),
          ...(data.activityLevel !== null && { activityLevel: data.activityLevel }),
        };
        if (Object.keys(basics).length > 0) {
          await profileBasicsMutation.mutateAsync(basics);
        }
        router.push('/dashboard');
      } catch {
        // onError already surfaced the message.
      }
      return;
    }

    // Premium setup needs goal and metrics. A user who upgraded mid-wizard
    // skipped those steps, and Finish used to do nothing at all (audit
    // F-ONB-1-3): send them to the first missing step and say why.
    if (data.goal === null) {
      setError('Pick a goal to finish setting up.');
      setStep(stepIndexOf('goal'));
      return;
    }
    if (
      data.biologicalSex === null ||
      data.age === null ||
      data.heightCm === null ||
      data.weightKg === null ||
      data.activityLevel === null
    ) {
      setError('Add your body metrics to finish setting up.');
      setStep(stepIndexOf('metrics'));
      return;
    }

    setupMutation.mutate({
      goal: data.goal,
      biologicalSex: data.biologicalSex,
      age: data.age,
      heightCm: data.heightCm,
      weightKg: data.weightKg,
      activityLevel: data.activityLevel,
      dietaryRestrictions: data.dietaryRestrictions,
      allergies: data.allergies,
      dislikedIngredients: data.dislikedIngredients,
      cuisinePreferences: data.cuisinePreferences,
      mealsPerDay: data.mealsPerDay,
    });
  }

  // "Step 1" with no total while the intent question is open: the answer
  // changes the total, and the counter must never grow (4 → 5).
  const progress = onboardingProgress(steps, step - 1);
  const progressPct = progress.percent ?? 0;
  const isSubmitting =
    setupMutation.isPending || safetyMutation.isPending || intentMutation.isPending;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {/* ── Progress bar ── */}
      <div className="border-b bg-background px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>{progress.label}</span>
            {progress.percent !== null && <span>{progress.percent}% complete</span>}
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

          {stepKey === 'intent' && (
            <StepIntent
              value={intent}
              onChange={(next) => setIntent(next)}
              onSkip={handleSkipIntent}
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

          {/* Free flow: safety first, then a preview of premium personalisation */}
          {!isPremium && stepKey === 'diet' && (
            <StepDiet
              value={{
                dietaryRestrictions: data.dietaryRestrictions,
                allergies: data.allergies,
                dislikedIngredients: data.dislikedIngredients,
              }}
              onChange={(diet) => setData((d) => ({ ...d, ...diet }))}
            />
          )}

          {!isPremium && stepKey === 'goal' && (
            <div className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                Optional — skip if you just want chef-picked meals.
              </p>
              <StepGoal
                value={data.goal}
                onChange={(goal: Goal) => setData((d) => ({ ...d, goal }))}
              />
            </div>
          )}

          {!isPremium && stepKey === 'metrics' && (
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
                  goal={data.goal}
                />
              </div>
              <UpgradeCard
                source="onboarding"
                title="Want every week generated around this profile?"
                description="Free plans are chef-picked and always respect your allergies. Premium — free during the beta — has the AI chef build each week around your goal, targets and taste."
                perkDisplay="carousel"
              />
            </div>
          )}

          {isPremium && stepKey === 'goal' && (
            <StepGoal
              value={data.goal}
              onChange={(goal: Goal) => setData((d) => ({ ...d, goal }))}
            />
          )}

          {isPremium && stepKey === 'metrics' && (
            <StepMetrics
              value={{
                biologicalSex: data.biologicalSex,
                age: data.age,
                heightCm: data.heightCm,
                weightKg: data.weightKg,
                activityLevel: data.activityLevel,
              }}
              onChange={(metrics) => setData((d) => ({ ...d, ...metrics }))}
              goal={data.goal}
            />
          )}

          {isPremium && stepKey === 'diet' && (
            <StepDiet
              value={{
                dietaryRestrictions: data.dietaryRestrictions,
                allergies: data.allergies,
                dislikedIngredients: data.dislikedIngredients,
              }}
              onChange={(diet) => setData((d) => ({ ...d, ...diet }))}
            />
          )}

          {isPremium && stepKey === 'cuisine' && (
            <StepCuisine
              value={{
                cuisinePreferences: data.cuisinePreferences,
                mealsPerDay: data.mealsPerDay,
              }}
              onChange={(cuisine) => setData((d) => ({ ...d, ...cuisine }))}
              // Leaving mid-wizard would lose the answers; the household is
              // reachable from Profile and Preferences afterwards.
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

          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue() || isSubmitting}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? 'Saving…'
              : stepKey === 'intent' && intent === 'TRAIN'
                ? 'Set up training'
                : step === totalSteps
                  ? 'Finish'
                  : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
