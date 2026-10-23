import type { ReactNode } from 'react';
import { useNumbersMode } from './numbers-mode';

// Lane E3: the one way to put a nutrition figure on screen. It renders its
// children only when the current numbers mode shows that kind of number
// (`numbersVisibility`): kcal and macros in full mode, protein in full and
// protein-only mode, nothing in "Hide numbers". `fallback` is what shows instead —
// usually nothing, sometimes a portion or an "on plan" tick.

export type NutritionKind = 'kcal' | 'macros' | 'protein';

export function NutritionNumber({
  kind,
  children,
  fallback = null,
}: {
  kind: NutritionKind;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { show } = useNumbersMode();
  return <>{show[kind] ? children : fallback}</>;
}
