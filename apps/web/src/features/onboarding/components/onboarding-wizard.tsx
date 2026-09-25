'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UpgradeCard } from '@/features/premium/components/UpgradeButton';
import { trpc } from '@/lib/trpc';
import { EMPTY_WIZARD_DATA, TOTAL_STEPS, type Goal, type WizardData } from '../types';
import { StepCuisine } from './step-cuisine';
import { StepDiet } from './step-diet';
import { StepGoal } from './step-goal';
import { StepMetrics } from './step-metrics';

// ─── Wizard Component ─────────────────────────────────────────────────────────
// Premium: 4 steps (goal → metrics → diet → cuisine) saved via
// preferences.setup. Free (P1-2 + ux-fixes-plan.md 3.1): 3 steps — safety
// (free preferences.updateSafety), then OPTIONAL goal and body metrics
// (preferences.saveProfileBasics, free tier stores them so the dashboard
// target is real). The old step 2 was a premium pitch masquerading as
// onboarding progress (review O-1); the pitch is now a card under step 3.

export function OnboardingWizard({
  isPremium,
  initialData = EMPTY_WIZARD_DATA,
}: {
  isPremium: boolean;
  /** Saved preferences, so a re-run never starts blank (F-ONB-1-1). */
  initialData?: WizardData;
}) {
  const router = useRouter();
  const totalSteps = isPremium ? TOTAL_STEPS : 3;
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WizardData>(initialData);

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
    if (!isPremium) return true; // both free steps are optional
    if (step === 1) return data.goal !== null;
    if (step === 2)
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
    return true; // Steps 3 and 4 are optional
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function handleContinue() {
    setError(null);
    if (step < totalSteps) {
      setStep((s) => s + 1);
    } else {
      void handleFinish();
    }
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
      setStep(1);
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
      setStep(2);
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
      servingSize: data.servingSize,
    });
  }

  const progressPct = Math.round((step / totalSteps) * 100);
  const isSubmitting = setupMutation.isPending || safetyMutation.isPending;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      {/* ── Progress bar ── */}
      <div className="border-b bg-background px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Step {step} of {totalSteps}
            </span>
            <span>{progressPct}% complete</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
              role="progressbar"
              aria-valuenow={step}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
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

          {/* Free flow: safety first, then a preview of premium personalisation */}
          {!isPremium && step === 1 && (
            <StepDiet
              value={{
                dietaryRestrictions: data.dietaryRestrictions,
                allergies: data.allergies,
                dislikedIngredients: data.dislikedIngredients,
              }}
              onChange={(diet) => setData((d) => ({ ...d, ...diet }))}
            />
          )}

          {!isPremium && step === 2 && (
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

          {!isPremium && step === 3 && (
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

          {isPremium && step === 1 && (
            <StepGoal
              value={data.goal}
              onChange={(goal: Goal) => setData((d) => ({ ...d, goal }))}
            />
          )}

          {isPremium && step === 2 && (
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

          {isPremium && step === 3 && (
            <StepDiet
              value={{
                dietaryRestrictions: data.dietaryRestrictions,
                allergies: data.allergies,
                dislikedIngredients: data.dislikedIngredients,
              }}
              onChange={(diet) => setData((d) => ({ ...d, ...diet }))}
            />
          )}

          {isPremium && step === 4 && (
            <StepCuisine
              value={{
                cuisinePreferences: data.cuisinePreferences,
                mealsPerDay: data.mealsPerDay,
                servingSize: data.servingSize,
              }}
              onChange={(cuisine) => setData((d) => ({ ...d, ...cuisine }))}
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
            className="inline-flex h-11 items-center justify-center rounded-md sm:h-10 border border-input bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue() || isSubmitting}
            className="inline-flex h-11 items-center justify-center rounded-md sm:h-10 bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : step === totalSteps ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
