'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { StepCuisine } from '@/features/onboarding/components/step-cuisine';
import { StepDiet } from '@/features/onboarding/components/step-diet';
import { StepGoal } from '@/features/onboarding/components/step-goal';
import { StepMetrics } from '@/features/onboarding/components/step-metrics';
import type { ActivityLevel, BiologicalSex, Goal } from '@/features/onboarding/types';
import { UpgradeCard } from '@/features/premium/components/UpgradeButton';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { DISPLAY_CURRENCIES, type DisplayCurrency } from '@chefer/types';
import { Toast } from '@chefer/ui';
import { currencySymbol, fromEur, toDisplayCurrency, toEur } from '@chefer/utils';
import type { ChefProfileData, DietaryPreferencesData } from '../types';
import { HouseholdSection } from './household-section';

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

// ─── Currency helpers (backlog P2-6) ──────────────────────────────────────────
// The budget is stored in EUR; the field shows and takes the user's currency.

const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  EUR: 'Euro (€)',
  USD: 'US dollar ($)',
  GBP: 'British pound (£)',
  RON: 'Romanian leu (RON)',
};

/** EUR budget → input text in `currency` ("55.56" EUR → "60" USD). */
function budgetText(budgetEur: number | null | undefined, currency: DisplayCurrency): string {
  if (budgetEur == null) return '';
  return String(Math.round(fromEur(budgetEur, currency) * 100) / 100);
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
  deliveryAddress: string;
  deliveryCurrency: DisplayCurrency;
  preferredUnits: 'METRIC' | 'IMPERIAL';
  /**
   * Weekly ingredient budget as input text IN deliveryCurrency; '' = no
   * budget (P2-4). Converted to EUR on save.
   */
  weeklyBudget: string;
}

interface PreferencesFormProps {
  chefProfile: ChefProfileData | null;
  dietaryPreferences: DietaryPreferencesData | null;
  /** Free users edit only the safety section; the rest renders locked (P1-2). */
  isPremium: boolean;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">{children}</section>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreferencesForm({
  chefProfile,
  dietaryPreferences,
  isPremium,
}: PreferencesFormProps) {
  const initialCurrency = toDisplayCurrency(chefProfile?.deliveryCurrency);
  const initialUnits =
    (chefProfile?.preferredUnits as 'METRIC' | 'IMPERIAL' | undefined) ?? 'METRIC';
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
    deliveryAddress: chefProfile?.deliveryAddress ?? '',
    deliveryCurrency: initialCurrency,
    preferredUnits: initialUnits,
    weeklyBudget: budgetText(chefProfile?.weeklyBudgetEur, initialCurrency),
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const utils = trpc.useUtils();
  const router = useRouter();

  // Safety (allergies/restrictions/dislikes) and display units/currency save
  // through free procedures; everything else is premium-only updateTargets.
  const safetyMutation = trpc.preferences.updateSafety.useMutation();
  const displayMutation = trpc.preferences.setDisplayPreferences.useMutation();
  const targetsMutation = trpc.preferences.updateTargets.useMutation();
  const isSaving =
    safetyMutation.isPending || displayMutation.isPending || targetsMutation.isPending;

  function onSaved() {
    capture('preferences_saved', { premium: isPremium });
    setToast({ message: 'Preferences saved — taking you to your dashboard…', type: 'success' });
    // Unit system, calorie target etc. are read elsewhere (shopping list,
    // recipe pages) via preferences.get — refresh those caches immediately
    void utils.preferences.get.invalidate();
    void utils.dashboard.invalidate();
    void utils.mealPlan.invalidate();
    // A unit change also moves the gym's kg/lb (one preference, P2-6).
    if (data.preferredUnits !== initialUnits) void utils.gym.invalidate();
    // Brief pause so the confirmation is seen before leaving the page.
    setTimeout(() => {
      router.push('/dashboard');
    }, 900);
  }

  // ── Profile completeness (informational only — see handleSave) ──────────────

  const profileComplete =
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
  // Saves whatever is filled (review PR-1): updateTargets accepts partials, so
  // changing only a cuisine or the budget no longer demands a full body
  // profile. The old all-or-nothing gate blocked exactly those small edits.

  async function handleSave() {
    if (isSaving) return;
    try {
      await safetyMutation.mutateAsync({
        dietaryRestrictions: data.dietaryRestrictions,
        allergies: data.allergies,
        dislikedIngredients: data.dislikedIngredients,
      });
      // Units + currency are free on every tier (audit F-DASH-3-2).
      if (data.preferredUnits !== initialUnits || data.deliveryCurrency !== initialCurrency) {
        await displayMutation.mutateAsync({
          preferredUnits: data.preferredUnits,
          currency: data.deliveryCurrency,
        });
      }
      if (isPremium) {
        await targetsMutation.mutateAsync({
          ...(data.goal !== null && { goal: data.goal }),
          ...(data.biologicalSex !== null && { biologicalSex: data.biologicalSex }),
          ...(data.age !== null && data.age > 0 && { age: data.age }),
          ...(data.heightCm !== null && data.heightCm > 0 && { heightCm: data.heightCm }),
          ...(data.weightKg !== null && data.weightKg > 0 && { weightKg: data.weightKg }),
          ...(data.activityLevel !== null && { activityLevel: data.activityLevel }),
          cuisinePreferences: data.cuisinePreferences,
          mealsPerDay: data.mealsPerDay,
          deliveryAddress: data.deliveryAddress || null,
          weeklyBudgetEur: data.weeklyBudget.trim()
            ? Math.min(2000, toEur(Number(data.weeklyBudget), data.deliveryCurrency))
            : null,
        });
      }
      onSaved();
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to save preferences.',
        type: 'error',
      });
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* Diet & restrictions — the safety section, free for every account.
            Rendered first so free users see their editable section on top. */}
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

        {/* My household (F2) — member chips + per-member safety editors for
            premium; the §6.4 ghost state for free users. Self-contained
            (its own tRPC state), so it sits outside the save flow. */}
        <HouseholdSection
          isPremium={isPremium}
          ownerSafety={{
            allergies: data.allergies,
            dietaryRestrictions: data.dietaryRestrictions,
          }}
        />

        {/* Units & currency — free on every tier (backlog P2-6, audit
            F-DASH-3-2). One unit system for recipes, shopping, body weight
            and the gym; prices are EUR estimates shown in this currency. */}
        <Section>
          <h2 className="mb-4 text-base font-semibold">Units &amp; currency</h2>
          <div className="space-y-5">
            <div>
              <p id="units-label" className="mb-1 block text-sm font-medium text-foreground">
                Measurement units
              </p>
              <div role="radiogroup" aria-labelledby="units-label" className="flex flex-wrap gap-2">
                {(
                  [
                    ['METRIC', 'Metric (g, ml, kg)'],
                    ['IMPERIAL', 'Imperial (oz, cups, lb)'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={data.preferredUnits === value}
                    onClick={() => setData((d) => ({ ...d, preferredUnits: value }))}
                    className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                      data.preferredUnits === value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-input text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Recipes, shopping lists, your body weight and gym loads all use this system.
              </p>
            </div>
            <div>
              <label
                htmlFor="currency-select"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Currency
              </label>
              <select
                id="currency-select"
                value={data.deliveryCurrency}
                onChange={(e) => {
                  const next = e.target.value as DisplayCurrency;
                  setData((d) => {
                    // Keep the typed budget worth the same when the currency changes.
                    const amount = Number(d.weeklyBudget);
                    const weeklyBudget =
                      d.weeklyBudget.trim() && Number.isFinite(amount)
                        ? budgetText(toEur(amount, d.deliveryCurrency), next)
                        : d.weeklyBudget;
                    return { ...d, deliveryCurrency: next, weeklyBudget };
                  });
                }}
                className="min-h-11 w-full max-w-xs rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {DISPLAY_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCY_LABELS[c]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Prices are estimates from typical supermarket prices
                {data.deliveryCurrency !== 'EUR' && ', converted from euros at an approximate rate'}
                .
              </p>
            </div>
          </div>
        </Section>

        {/* Personal targets — premium personalisation. Free users see the
            upgrade panel instead (mutations are server-gated regardless). */}
        {!isPremium && (
          <UpgradeCard
            source="preferences-locked"
            title="Unlock your personal targets"
            description="Set your goal, body metrics and cuisine preferences, and the AI chef builds every plan around them. Your allergies and restrictions above are always respected — on any plan."
          />
        )}

        {isPremium && (
          <>
            {/* Goal — #targets is where "update your targets" links land
                (post-upgrade activation, audit F-PM-9) */}
            <section
              id="targets"
              className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
            >
              <StepGoal
                value={data.goal}
                onChange={(goal: Goal) => setData((d) => ({ ...d, goal }))}
              />
            </section>

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
                goal={data.goal}
              />
            </Section>

            {/* Cuisine & meal cadence */}
            <Section>
              <StepCuisine
                value={{
                  cuisinePreferences: data.cuisinePreferences,
                  mealsPerDay: data.mealsPerDay,
                }}
                onChange={(cuisine) => setData((d) => ({ ...d, ...cuisine }))}
                // The household section is on this page (P2-3).
                showHouseholdHint={false}
              />
            </Section>

            {/* Weekly budget (P2-4) — generation treats it as a hard ceiling */}
            <Section>
              <h2 className="mb-1 text-base font-semibold">Weekly Budget</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Keep my week under a set amount — the AI chef plans affordable meals to stay within
                it. Leave empty for no budget.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-medium text-muted-foreground">
                  {currencySymbol(data.deliveryCurrency)}
                </span>
                <input
                  type="number"
                  min={1}
                  max={Math.round(fromEur(2000, data.deliveryCurrency))}
                  step="1"
                  value={data.weeklyBudget}
                  onChange={(e) => setData((d) => ({ ...d, weeklyBudget: e.target.value }))}
                  onFocus={(e) => e.currentTarget.select()}
                  placeholder="e.g. 60"
                  className="w-32 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-sm text-muted-foreground">per week</span>
              </div>
            </Section>
          </>
        )}

        {/* Nutrition Preview */}
        {(() => {
          if (!isPremium) return null;
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
        <div className="flex flex-col-reverse items-stretch gap-3 rounded-xl border bg-card px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-end sm:gap-4 sm:px-6">
          {isPremium && !profileComplete && (
            <p className="text-sm text-muted-foreground">
              Save works any time — complete goal + body metrics whenever you want your calorie
              target computed from your body.
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
          >
            {isSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
