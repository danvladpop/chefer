import { StepCuisine } from '@/features/onboarding/components/step-cuisine';
import { StepGoal } from '@/features/onboarding/components/step-goal';
import { StepMetrics } from '@/features/onboarding/components/step-metrics';
import type { ActivityLevel, BiologicalSex, Goal } from '@/features/onboarding/types';
import { UpgradeCard } from '@/features/premium/components/UpgradeButton';
import { trpc } from '@/lib/trpc';
import { skipToken } from '@tanstack/react-query';
import { lifterProteinNote } from '@chefer/utils';
import { Section } from './section';
import { TargetsCard } from './TargetsCard';

// ─── Client-side nutrition preview (instant estimate, replaced by the
// server's numbers as soon as they arrive — see serverPreview below) ─────────

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

// ─── Component ────────────────────────────────────────────────────────────────

interface TargetsData {
  goal: Goal | null;
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
  cuisinePreferences: string[];
  mealsPerDay: number;
}

interface TargetsSectionProps {
  /** Free users see the upgrade panel instead (mutations are server-gated regardless). */
  isPremium: boolean;
  data: TargetsData;
  onChange: (patch: Partial<TargetsData>) => void;
}

/**
 * Goal, body metrics, cuisine/meal cadence and the nutrition preview —
 * premium personalisation (the AI chef builds every plan around these).
 * Split out of preferences-form.tsx (T-00.13, no behaviour change).
 */
export function TargetsSection({ isPremium, data, onChange }: TargetsSectionProps) {
  // Instant local estimate, replaced by the server's numbers as soon as they
  // arrive: preferences.computeTargets applies the same rules as the
  // dashboard (the 2.2 g/kg protein cap, and a lifter's bodyweight protein),
  // so the preview shows what the dashboard will show.
  const previewInput =
    isPremium &&
    data.goal !== null &&
    data.biologicalSex !== null &&
    data.age !== null &&
    data.age >= 10 &&
    data.age <= 110 &&
    data.heightCm !== null &&
    data.heightCm > 0 &&
    data.heightCm <= 300 &&
    data.weightKg !== null &&
    data.weightKg > 0 &&
    data.weightKg <= 500 &&
    data.activityLevel !== null
      ? {
          goal: data.goal,
          biologicalSex: data.biologicalSex,
          age: Math.round(data.age),
          heightCm: data.heightCm,
          weightKg: data.weightKg,
          activityLevel: data.activityLevel,
        }
      : null;
  const serverPreview = trpc.preferences.computeTargets.useQuery(previewInput ?? skipToken, {
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  }).data;

  if (!isPremium) {
    return (
      <UpgradeCard
        source="preferences-locked"
        title="Unlock your personal targets"
        description="Set your goal, body metrics and cuisine preferences, and the AI chef builds every plan around them. Your allergies and restrictions above are always respected — on any plan."
      />
    );
  }

  const local = computePreviewTargets(data);
  const preview = local
    ? serverPreview
      ? {
          ...local,
          calories: serverPreview.dailyCalorieTarget,
          proteinG: serverPreview.proteinG,
          carbsG: serverPreview.carbsG,
          fatG: serverPreview.fatG,
          proteinPct: serverPreview.proteinPct,
          carbsPct: serverPreview.carbsPct,
          fatPct: serverPreview.fatPct,
        }
      : local
    : null;
  const lifter = serverPreview?.lifter ?? null;

  return (
    <>
      {/* Goal — #targets is where "update your targets" links land
          (post-upgrade activation, audit F-PM-9) */}
      <section id="targets" className="scroll-mt-20 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <StepGoal
          value={data.goal}
          onChange={(goal: Goal) => onChange({ goal })}
          showDisclaimer={false}
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
          onChange={onChange}
          goal={data.goal}
        />
      </Section>

      {/* §2.11, T-35.3 — Suggested (computed) or My own (never moved
          silently — gym setup, a weigh-in or a goal edit only propose). */}
      <TargetsCard />

      {/* Cuisine & meal cadence */}
      <Section>
        <StepCuisine
          value={{
            cuisinePreferences: data.cuisinePreferences,
            mealsPerDay: data.mealsPerDay,
          }}
          onChange={onChange}
          // The household section is on this page (P2-3).
          showHouseholdHint={false}
        />
      </Section>

      {/* Nutrition Preview */}
      {preview && (
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
          {lifter && (
            <p
              data-testid="preferences-lifter-note"
              className="mt-3 text-center text-xs text-muted-foreground"
            >
              {lifterProteinNote(lifter.proteinGPerKg)}
            </p>
          )}
          {preview.adjustment !== 0 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              TDEE: {preview.tdee} kcal
              {preview.adjustment > 0 ? ` + ${preview.adjustment}` : ` ${preview.adjustment}`} kcal
              adjustment
            </p>
          )}
        </Section>
      )}
    </>
  );
}
