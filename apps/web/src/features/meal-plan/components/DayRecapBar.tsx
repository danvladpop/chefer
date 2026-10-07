import { useNumbersMode } from '@/features/numbers-mode/numbers-mode';
import { ChevronRight } from 'lucide-react';
import { cn, formatKcal, formatMacroLine, sumPlanDay } from '@chefer/utils';

interface NutritionInfo {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface MealSlot {
  type: string;
  recipe: { nutritionInfo: NutritionInfo };
  /** P1-1: servings of the recipe this slot is (absent = 1). */
  portion?: number | undefined;
}

interface DayRecapBarProps {
  meals: MealSlot[];
  /**
   * The user's daily calorie target (WeekPlanDto.calorieTarget). When the
   * day's total strays more than ±15% from it, the bar says so instead of
   * letting an under-planned day pass silently (trust fix P-1).
   */
  calorieTarget?: number | undefined;
  /**
   * P1-1: grams the day's protein falls short of target (DayPlanDto.proteinGapG,
   * present only when meaningfully short) — shown as an honest hint.
   */
  proteinGapG?: number | undefined;
  /**
   * T-11.3: makes the under/over-target status a tappable, neutral line that
   * opens the plan-miss sheet (Bigger portions / Add a snack / Keep it).
   * Absent (read-only weeks) = the status is plain text.
   */
  onOpenMiss?: (() => void) | undefined;
}

/** Matches the API's PLAN_KCAL_TOLERANCE — one band, every surface. */
const TARGET_BAND = 0.15;

/** "About 300 kcal" — rounded to 10 so the status never reads falsely precise. */
export function aboutKcal(n: number): string {
  return `About ${formatKcal(Math.round(Math.abs(n) / 10) * 10)} kcal`;
}

function StatusLine({
  testId,
  text,
  onOpenMiss,
}: {
  testId: string;
  text: string;
  onOpenMiss?: (() => void) | undefined;
}) {
  const cls = 'mt-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700';
  if (!onOpenMiss) {
    return (
      <p data-testid={testId} className={cls}>
        {text}
      </p>
    );
  }
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onOpenMiss}
      aria-label={`${text}. See options`}
      className={cn(
        cls,
        'flex min-h-11 w-full items-center justify-between gap-1 text-left hover:bg-gray-200 sm:min-h-0',
      )}
    >
      <span className="min-w-0">{text}</span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
    </button>
  );
}

export function DayRecapBar({ meals, calorieTarget, proteinGapG, onOpenMiss }: DayRecapBarProps) {
  // Totals count each slot at its portion (P1-1) — same sum as mobile.
  const { kcal, protein, carbs, fat } = sumPlanDay(meals);
  const totals = { calories: kcal, protein, carbs, fat };
  // WP-08: protein-only mode shows the day's protein and only a protein shortfall.
  const { proteinOnly } = useNumbersMode();
  const judgedTarget = proteinOnly ? undefined : calorieTarget;

  const delta = judgedTarget ? totals.calories - judgedTarget : 0;
  const offTarget = judgedTarget ? Math.abs(delta) / judgedTarget > TARGET_BAND : false;
  const proteinShort = proteinGapG !== undefined && proteinGapG > 0;

  return (
    <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">Day total</p>
      {proteinOnly ? (
        <p data-testid="day-total-protein" className="text-sm font-bold text-[#944a00]">
          {totals.protein} g protein
        </p>
      ) : (
        <p className="text-sm font-bold text-[#944a00]">{totals.calories} kcal</p>
      )}
      {offTarget && (
        <StatusLine
          testId="day-target-status"
          text={`${aboutKcal(delta)} ${delta < 0 ? 'under' : 'over'} target`}
          onOpenMiss={onOpenMiss}
        />
      )}
      {!proteinOnly && (
        // FB7-11: the shared "P 80 g · C 200 g · F 60 g" format, as on mobile.
        <p data-testid="day-total-macros" className="mt-1 text-xs text-gray-500">
          {formatMacroLine(totals)}
        </p>
      )}
      {proteinShort && !offTarget && (
        <StatusLine
          testId="day-protein-gap"
          text={`About ${proteinGapG} g short on protein`}
          onOpenMiss={onOpenMiss}
        />
      )}
    </div>
  );
}
