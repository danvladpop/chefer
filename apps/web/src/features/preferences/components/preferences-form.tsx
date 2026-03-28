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

// ─── Client-side nutrition computation ───────────────────────────────────────

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  ATHLETE: 1.9,
};

const GOAL_ADJUSTMENTS: Record<string, number> = {
  LOSE_WEIGHT: -500,
  MAINTAIN: 0,
  GAIN_MUSCLE: 300,
  EAT_HEALTHIER: 0,
};

const GOAL_MACRO_SPLITS: Record<string, { protein: number; carbs: number; fat: number }> = {
  LOSE_WEIGHT: { protein: 0.35, carbs: 0.35, fat: 0.3 },
  GAIN_MUSCLE: { protein: 0.35, carbs: 0.4, fat: 0.25 },
  MAINTAIN: { protein: 0.25, carbs: 0.45, fat: 0.3 },
  EAT_HEALTHIER: { protein: 0.2, carbs: 0.5, fat: 0.3 },
};

const GOAL_DESCRIPTIONS: Record<string, string> = {
  LOSE_WEIGHT: '500 kcal daily deficit to support fat loss',
  GAIN_MUSCLE: '300 kcal daily surplus to support muscle growth',
  MAINTAIN: 'Maintenance calories to keep your current weight',
  EAT_HEALTHIER: 'Maintenance calories with optimised macro balance',
};

interface PreviewFormData {
  goal: string | null;
  biologicalSex: string | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: string | null;
}

function computePreviewTargets(data: PreviewFormData) {
  if (
    !data.goal ||
    !data.biologicalSex ||
    !data.age ||
    !data.heightCm ||
    !data.weightKg ||
    !data.activityLevel
  ) {
    return null;
  }
  const sexConstant = data.biologicalSex === 'MALE' ? 5 : -161;
  const bmr = 10 * data.weightKg + 6.25 * data.heightCm - 5 * data.age + sexConstant;
  const multiplier = ACTIVITY_MULTIPLIERS[data.activityLevel] ?? 1.55;
  const tdee = Math.round(bmr * multiplier);
  const adjustment = GOAL_ADJUSTMENTS[data.goal] ?? 0;
  const calories = Math.max(1200, tdee + adjustment);
  const split = GOAL_MACRO_SPLITS[data.goal] ?? GOAL_MACRO_SPLITS['MAINTAIN']!;
  return {
    calories,
    tdee,
    adjustment,
    proteinG: Math.round((calories * split.protein) / 4),
    carbsG: Math.round((calories * split.carbs) / 4),
    fatG: Math.round((calories * split.fat) / 9),
    proteinPct: Math.round(split.protein * 100),
    carbsPct: Math.round(split.carbs * 100),
    fatPct: Math.round(split.fat * 100),
    description: GOAL_DESCRIPTIONS[data.goal] ?? '',
  };
}

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
  deliveryAddress: string;
  deliveryCurrency: string;
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
    deliveryAddress: chefProfile?.deliveryAddress ?? '',
    deliveryCurrency: chefProfile?.deliveryCurrency ?? 'EUR',
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
      deliveryAddress: data.deliveryAddress || null,
      deliveryCurrency: data.deliveryCurrency as 'EUR' | 'USD' | 'GBP' | 'RON',
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

        {/* Shopping & Delivery */}
        <Section>
          <h2 className="mb-4 text-base font-semibold">Shopping &amp; Delivery</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Delivery Address
              </label>
              <textarea
                value={data.deliveryAddress}
                onChange={(e) => setData((d) => ({ ...d, deliveryAddress: e.target.value }))}
                placeholder="Enter your delivery address…"
                rows={2}
                className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Used for local store suggestions and delivery estimates in the Shopping List.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Preferred Currency
              </label>
              <select
                value={data.deliveryCurrency}
                onChange={(e) => setData((d) => ({ ...d, deliveryCurrency: e.target.value }))}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="EUR">EUR — Euro (€)</option>
                <option value="USD">USD — US Dollar ($)</option>
                <option value="GBP">GBP — British Pound (£)</option>
                <option value="RON">RON — Romanian Leu</option>
              </select>
            </div>
          </div>
        </Section>

        {/* Nutrition Preview */}
        {(() => {
          const preview = computePreviewTargets(data);
          if (!preview) return null;
          return (
            <Section>
              <h2 className="mb-3 text-base font-semibold">Estimated Daily Nutrition Targets</h2>
              <p className="mb-4 text-sm text-muted-foreground">{preview.description}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-[#fff3e8] p-3 text-center">
                  <p className="text-2xl font-bold text-[#944a00]">{preview.calories}</p>
                  <p className="mt-0.5 text-xs text-[#944a00]/70">kcal / day</p>
                </div>
                <div className="rounded-xl bg-blue-50 p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{preview.proteinG}g</p>
                  <p className="mt-0.5 text-xs text-blue-500">Protein ({preview.proteinPct}%)</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{preview.carbsG}g</p>
                  <p className="mt-0.5 text-xs text-amber-500">Carbs ({preview.carbsPct}%)</p>
                </div>
                <div className="rounded-xl bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{preview.fatG}g</p>
                  <p className="mt-0.5 text-xs text-green-500">Fat ({preview.fatPct}%)</p>
                </div>
              </div>
              {preview.adjustment !== 0 && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  TDEE: {preview.tdee} kcal
                  {preview.adjustment > 0
                    ? ` + ${preview.adjustment}`
                    : ` ${preview.adjustment}`}{' '}
                  kcal adjustment
                </p>
              )}
            </Section>
          );
        })()}

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
