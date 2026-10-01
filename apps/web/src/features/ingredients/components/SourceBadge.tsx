import type { NutritionSource } from '@chefer/types';
import { cn } from '@chefer/ui';
import { nutritionSourceLabel } from '@chefer/utils';

// Where a catalog row's nutrition comes from: USDA / CIQUAL / Label / Mine
// (plan-ingredient-catalog §10). Never an AI estimate (D1).

const TONE: Record<string, string> = {
  USDA: 'bg-sky-50 text-sky-800',
  CIQUAL: 'bg-indigo-50 text-indigo-800',
  Label: 'bg-amber-50 text-amber-900',
  Mine: 'bg-purple-100 text-purple-800',
  Chefer: 'bg-gray-100 text-gray-700',
};

const TITLE: Record<string, string> = {
  USDA: 'Nutrition from USDA FoodData Central',
  CIQUAL: 'Nutrition from CIQUAL (ANSES, France)',
  Label: 'Nutrition from a typical product label',
  Mine: 'Your own ingredient — numbers from your label',
  Chefer: 'Nutrition maintained by Chefer',
};

export function SourceBadge({
  source,
  owner,
  className,
}: {
  source: NutritionSource;
  owner?: 'global' | 'mine' | null | undefined;
  className?: string;
}) {
  const label = nutritionSourceLabel(source, owner);
  return (
    <span
      title={TITLE[label]}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-xs font-semibold',
        TONE[label],
        className,
      )}
    >
      {label}
    </span>
  );
}
