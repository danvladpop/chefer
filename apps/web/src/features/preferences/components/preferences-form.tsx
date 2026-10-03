'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { StepDietHandle } from '@/features/onboarding/components/step-diet';
import type { ActivityLevel, BiologicalSex, Goal } from '@/features/onboarding/types';
import { useHealthConsent } from '@/features/privacy/use-health-consent';
import { SafetyReviewCard } from '@/features/safety/components/SafetyReviewCard';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { bodyMetricsAgeError, HEALTH_CONSENT_COPY, type DisplayCurrency } from '@chefer/types';
import { Toast } from '@chefer/ui';
import {
  fromEur,
  parseWeeklyBudget,
  toDisplayCurrency,
  toEur,
  userFacingErrorMessage,
} from '@chefer/utils';
import type { ChefProfileData, DietaryPreferencesData } from '../types';
import { BudgetSection } from './budget-section';
import { HouseholdSection } from './household-section';
import { SafetySection } from './safety-section';
import { TargetsSection } from './targets-section';
import { UnitsSection } from './units-section';

// ─── Currency helpers (backlog P2-6) ──────────────────────────────────────────
// The budget is stored in EUR; the field shows and takes the user's currency.

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
  // T-26.2: allergies/diets, goal and body metrics are health information — asked
  // once, on the first save. "Don't save it" still saves everything else.
  const { requestHealthConsent, healthConsentSheet } = useHealthConsent();

  // Safety (allergies/restrictions/dislikes) and display units/currency save
  // through free procedures; everything else is premium-only updateTargets.
  const safetyMutation = trpc.preferences.updateSafety.useMutation({ meta: { silent: true } });
  // UX-ACC-01: a term typed in "Something else?" but never added with "Add" is
  // flushed into the saved value on Save instead of being dropped.
  const safetyPickerRef = useRef<StepDietHandle>(null);
  const displayMutation = trpc.preferences.setDisplayPreferences.useMutation({
    meta: { silent: true },
  });
  const targetsMutation = trpc.preferences.updateTargets.useMutation({ meta: { silent: true } });
  const isSaving =
    safetyMutation.isPending || displayMutation.isPending || targetsMutation.isPending;

  function onSaved(healthSkipped = false) {
    capture('preferences_saved', { premium: isPremium });
    setToast({
      message: healthSkipped
        ? `Preferences saved, except your health information. ${HEALTH_CONSENT_COPY.declinedNotice}`
        : 'Preferences saved — taking you to your dashboard…',
      type: 'success',
    });
    // Unit system, calorie target etc. are read elsewhere (shopping list,
    // recipe pages) via preferences.get — refresh those caches immediately
    void utils.preferences.get.invalidate();
    void utils.dashboard.invalidate();
    // UX-ACC-21: the suggested targets follow the goal and body just saved.
    void utils.targets.invalidate();
    void utils.mealPlan.invalidate();
    // A unit change also moves the gym's kg/lb (one preference, P2-6).
    if (data.preferredUnits !== initialUnits) void utils.gym.invalidate();
    // Brief pause so the confirmation is seen before leaving the page.
    setTimeout(
      () => {
        router.push('/dashboard');
      },
      healthSkipped ? 3500 : 900,
    );
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

  // Generic field patcher passed to every section — the same
  // `(x) => setData((d) => ({ ...d, ...x }))` pattern each section used
  // inline before the split (T-00.13).
  const patch = (fields: Partial<FormData>) => setData((d) => ({ ...d, ...fields }));

  // ── Save handler ────────────────────────────────────────────────────────────
  // Saves whatever is filled (review PR-1): updateTargets accepts partials, so
  // changing only a cuisine or the budget no longer demands a full body
  // profile. The old all-or-nothing gate blocked exactly those small edits.

  function handleSave() {
    if (isSaving) return;
    // R-02: no body metrics under 16 — the server would reject it anyway, but
    // say so here, before the consent sheet, and keep everything else unsaved
    // until the age is fixed or cleared.
    const ageError = isPremium ? bodyMetricsAgeError(data.age) : null;
    if (ageError !== null) {
      setToast({ message: ageError, type: 'error' });
      return;
    }
    // null = a typed term still needs a Keep/Remove choice: don't save yet.
    const safety = safetyPickerRef.current
      ? safetyPickerRef.current.flush()
      : {
          dietaryRestrictions: data.dietaryRestrictions,
          allergies: data.allergies,
          dislikedIngredients: data.dislikedIngredients,
        };
    if (safety === null) return;
    const hasSafetyTerms =
      safety.allergies.length +
        safety.dietaryRestrictions.length +
        safety.dislikedIngredients.length >
      0;
    const hasBodyData =
      isPremium &&
      (data.goal !== null ||
        data.biologicalSex !== null ||
        (data.age !== null && data.age > 0) ||
        (data.heightCm !== null && data.heightCm > 0) ||
        (data.weightKg !== null && data.weightKg > 0) ||
        data.activityLevel !== null);
    requestHealthConsent(() => void save(true, safety), {
      hasHealthData: hasSafetyTerms || hasBodyData,
      // "Don't save it": every other field is still saved, nothing health-related is sent.
      onDeclined: () => void save(false, safety),
    });
  }

  async function save(
    includeHealth: boolean,
    safety: { dietaryRestrictions: string[]; allergies: string[]; dislikedIngredients: string[] },
  ) {
    if (isSaving) return;
    // UX-ACC-23: a bad budget is shown inline and nothing is saved.
    const budget = parseWeeklyBudget(data.weeklyBudget, data.deliveryCurrency);
    if (isPremium && budget.kind === 'error') {
      setToast({ message: budget.message, type: 'error' });
      return;
    }
    try {
      if (includeHealth) {
        await safetyMutation.mutateAsync(safety);
      }
      // Units + currency are free on every tier (audit F-DASH-3-2).
      if (data.preferredUnits !== initialUnits || data.deliveryCurrency !== initialCurrency) {
        await displayMutation.mutateAsync({
          preferredUnits: data.preferredUnits,
          currency: data.deliveryCurrency,
        });
      }
      if (isPremium) {
        await targetsMutation.mutateAsync({
          ...(includeHealth && data.goal !== null && { goal: data.goal }),
          ...(includeHealth &&
            data.biologicalSex !== null && { biologicalSex: data.biologicalSex }),
          ...(includeHealth &&
            data.age !== null &&
            bodyMetricsAgeError(data.age) === null && { age: data.age }),
          ...(includeHealth &&
            data.heightCm !== null &&
            data.heightCm > 0 && { heightCm: data.heightCm }),
          ...(includeHealth &&
            data.weightKg !== null &&
            data.weightKg > 0 && { weightKg: data.weightKg }),
          ...(includeHealth &&
            data.activityLevel !== null && { activityLevel: data.activityLevel }),
          cuisinePreferences: data.cuisinePreferences,
          mealsPerDay: data.mealsPerDay,
          deliveryAddress: data.deliveryAddress || null,
          weeklyBudgetEur: budget.kind === 'ok' ? budget.eur : null,
        });
      }
      onSaved(!includeHealth);
    } catch (err) {
      setToast({
        message: userFacingErrorMessage(err, 'Failed to save preferences.'),
        type: 'error',
      });
    }
  }

  return (
    <>
      <div className="space-y-6">
        {/* T-01.3: one-time free-text migration card */}
        <SafetyReviewCard />

        {/* Diet & restrictions — the safety section, free for every account.
            Rendered first so free users see their editable section on top. */}
        <SafetySection
          ref={safetyPickerRef}
          value={{
            dietaryRestrictions: data.dietaryRestrictions,
            allergies: data.allergies,
            dislikedIngredients: data.dislikedIngredients,
          }}
          onChange={patch}
        />

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

        {/* Units & currency — free on every tier (backlog P2-6, audit F-DASH-3-2). */}
        <UnitsSection
          preferredUnits={data.preferredUnits}
          deliveryCurrency={data.deliveryCurrency}
          onUnitsChange={(preferredUnits) => patch({ preferredUnits })}
          onCurrencyChange={(next) =>
            setData((d) => {
              // Keep the typed budget worth the same when the currency changes.
              const amount = Number(d.weeklyBudget);
              const weeklyBudget =
                d.weeklyBudget.trim() && Number.isFinite(amount)
                  ? budgetText(toEur(amount, d.deliveryCurrency), next)
                  : d.weeklyBudget;
              return { ...d, deliveryCurrency: next, weeklyBudget };
            })
          }
        />

        {/* Personal targets — premium personalisation (goal, body metrics,
            cuisine/meal cadence, nutrition preview). Free users see the
            upgrade panel instead (mutations are server-gated regardless). */}
        <TargetsSection
          isPremium={isPremium}
          data={{
            goal: data.goal,
            biologicalSex: data.biologicalSex,
            age: data.age,
            heightCm: data.heightCm,
            weightKg: data.weightKg,
            activityLevel: data.activityLevel,
            cuisinePreferences: data.cuisinePreferences,
            mealsPerDay: data.mealsPerDay,
          }}
          onChange={patch}
        />

        {/* Weekly budget (P2-4) — generation treats it as a hard ceiling. */}
        <BudgetSection
          isPremium={isPremium}
          weeklyBudget={data.weeklyBudget}
          deliveryCurrency={data.deliveryCurrency}
          onChange={(weeklyBudget) => patch({ weeklyBudget })}
        />

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
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10"
          >
            {isSaving ? 'Saving…' : 'Save preferences'}
          </button>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {healthConsentSheet}
    </>
  );
}
