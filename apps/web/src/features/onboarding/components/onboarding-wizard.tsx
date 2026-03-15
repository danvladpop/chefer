'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { TOTAL_STEPS, type Goal, type WizardData } from '../types';
import { StepCuisine } from './step-cuisine';
import { StepDiet } from './step-diet';
import { StepGoal } from './step-goal';
import { StepMetrics } from './step-metrics';

// ─── Wizard Component ─────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WizardData>({
    goal: null,
    biologicalSex: null,
    age: null,
    heightCm: null,
    weightKg: null,
    activityLevel: null,
    dietaryRestrictions: [],
    allergies: [],
    dislikedIngredients: [],
    cuisinePreferences: [],
    mealsPerDay: 3,
    servingSize: 1,
  });

  const setupMutation = trpc.preferences.setup.useMutation({
    onSuccess: () => router.push('/dashboard'),
    onError: (err) => setError(err.message),
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  function canContinue(): boolean {
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
    if (step < TOTAL_STEPS) {
      setStep((s) => s + 1);
    } else {
      handleFinish();
    }
  }

  function handleBack() {
    if (step > 1) {
      setStep((s) => s - 1);
    } else {
      router.push('/dashboard');
    }
  }

  function handleFinish() {
    if (
      data.goal === null ||
      data.biologicalSex === null ||
      data.age === null ||
      data.heightCm === null ||
      data.weightKg === null ||
      data.activityLevel === null
    ) {
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

  const progressPct = Math.round((step / TOTAL_STEPS) * 100);
  const isSubmitting = setupMutation.isPending;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* ── Progress bar ── */}
      <div className="border-b bg-background px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Step {step} of {TOTAL_STEPS}
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
              aria-valuemax={TOTAL_STEPS}
            />
          </div>
        </div>
      </div>

      {/* ── Step content ── */}
      <div className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          {error && (
            <div className="mb-6 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {step === 1 && (
            <StepGoal
              value={data.goal}
              onChange={(goal: Goal) => setData((d) => ({ ...d, goal }))}
            />
          )}

          {step === 2 && (
            <StepMetrics
              value={{
                biologicalSex: data.biologicalSex,
                age: data.age,
                heightCm: data.heightCm,
                weightKg: data.weightKg,
                activityLevel: data.activityLevel,
              }}
              onChange={(metrics) => setData((d) => ({ ...d, ...metrics }))}
            />
          )}

          {step === 3 && (
            <StepDiet
              value={{
                dietaryRestrictions: data.dietaryRestrictions,
                allergies: data.allergies,
                dislikedIngredients: data.dislikedIngredients,
              }}
              onChange={(diet) => setData((d) => ({ ...d, ...diet }))}
            />
          )}

          {step === 4 && (
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
      <div className="border-t bg-background px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={isSubmitting}
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue() || isSubmitting}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : step === TOTAL_STEPS ? 'Finish' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
