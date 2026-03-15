'use client';

import { useState } from 'react';
import { StepCuisine } from '@/features/onboarding/components/step-cuisine';
import { StepDiet } from '@/features/onboarding/components/step-diet';
import { StepGoal } from '@/features/onboarding/components/step-goal';
import { StepMetrics } from '@/features/onboarding/components/step-metrics';
import type { ActivityLevel, BiologicalSex, Goal } from '@/features/onboarding/types';
import { trpc } from '@/lib/trpc';
import { Toast } from '@chefer/ui';
import type { ChefProfileData, DietaryPreferencesData } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  goal: Goal | null;
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  dietaryRestrictions: string[];
  allergies: string[];
  dislikedIngredients: string[];
  cuisinePreferences: string[];
  mealsPerDay: number;
  servingSize: number;
}

interface PreferencesFormProps {
  chefProfile: ChefProfileData | null;
  dietaryPreferences: DietaryPreferencesData | null;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border bg-card p-6 shadow-sm">{children}</section>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreferencesForm({ chefProfile, dietaryPreferences }: PreferencesFormProps) {
  const [data, setData] = useState<FormData>({
    goal: (chefProfile?.goal as Goal | null) ?? null,
    biologicalSex: (chefProfile?.biologicalSex as BiologicalSex | null) ?? null,
    age: chefProfile?.age ?? null,
    heightCm: chefProfile?.heightCm ?? null,
    weightKg: chefProfile?.weightKg ?? null,
    activityLevel: (chefProfile?.activityLevel as ActivityLevel | null) ?? null,
    dietaryRestrictions: dietaryPreferences?.dietaryRestrictions ?? [],
    allergies: dietaryPreferences?.allergies ?? [],
    dislikedIngredients: dietaryPreferences?.dislikedIngredients ?? [],
    cuisinePreferences: dietaryPreferences?.cuisinePreferences ?? [],
    mealsPerDay: dietaryPreferences?.mealsPerDay ?? 3,
    servingSize: dietaryPreferences?.servingSize ?? 1,
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const updateMutation = trpc.preferences.update.useMutation({
    onSuccess: () => {
      setToast({ message: 'Preferences saved successfully.', type: 'success' });
    },
    onError: (err) => {
      setToast({ message: err.message || 'Failed to save preferences.', type: 'error' });
    },
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  const canSave =
    data.goal !== null &&
    data.biologicalSex !== null &&
    data.age !== null &&
    data.age > 0 &&
    data.heightCm !== null &&
    data.heightCm > 0 &&
    data.weightKg !== null &&
    data.weightKg > 0 &&
    data.activityLevel !== null;

  // ── Save handler ────────────────────────────────────────────────────────────

  function handleSave() {
    if (!canSave) return;
    updateMutation.mutate({
      goal: data.goal!,
      biologicalSex: data.biologicalSex!,
      age: data.age!,
      heightCm: data.heightCm!,
      weightKg: data.weightKg!,
      activityLevel: data.activityLevel!,
      dietaryRestrictions: data.dietaryRestrictions,
      allergies: data.allergies,
      dislikedIngredients: data.dislikedIngredients,
      cuisinePreferences: data.cuisinePreferences,
      mealsPerDay: data.mealsPerDay,
      servingSize: data.servingSize,
    });
  }

  return (
    <>
      <div className="space-y-6">
        {/* Goal */}
        <Section>
          <StepGoal value={data.goal} onChange={(goal: Goal) => setData((d) => ({ ...d, goal }))} />
        </Section>

        {/* Body metrics */}
        <Section>
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
        </Section>

        {/* Diet & restrictions */}
        <Section>
          <StepDiet
            value={{
              dietaryRestrictions: data.dietaryRestrictions,
              allergies: data.allergies,
              dislikedIngredients: data.dislikedIngredients,
            }}
            onChange={(diet) => setData((d) => ({ ...d, ...diet }))}
          />
        </Section>

        {/* Cuisine & meal cadence */}
        <Section>
          <StepCuisine
            value={{
              cuisinePreferences: data.cuisinePreferences,
              mealsPerDay: data.mealsPerDay,
              servingSize: data.servingSize,
            }}
            onChange={(cuisine) => setData((d) => ({ ...d, ...cuisine }))}
          />
        </Section>

        {/* Save bar */}
        <div className="flex items-center justify-end gap-4 rounded-xl border bg-card px-6 py-4 shadow-sm">
          {!canSave && (
            <p className="text-sm text-muted-foreground">
              Fill in your goal, biological sex, age, height, weight, and activity level to save.
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || updateMutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
