import { AlertTriangle } from 'lucide-react';
import { cn } from '@chefer/utils';

// ─── AllergenWarning ──────────────────────────────────────────────────────────
// Shown wherever a recipe conflicts with the viewer's allergies or dietary
// restrictions (the API's `allergenWarnings`, household union). An unsafe dish
// must never be presented silently (audit F-REC-2-3, F-PLAN-1-7).

export function allergenLabel(warnings: string[]): string {
  return warnings.join(', ');
}

/** Full-width banner for the recipe page and cook mode. */
export function AllergenWarningBanner({
  warnings,
  className,
}: {
  warnings: string[] | undefined;
  className?: string;
}) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0">
        <span className="font-semibold">Contains {allergenLabel(warnings)}.</span> This recipe
        conflicts with your allergies or diet — check the ingredients or swap it.
      </p>
    </div>
  );
}

/** Compact chip for meal cards. */
export function AllergenWarningChip({
  warnings,
  className,
}: {
  warnings: string[] | undefined;
  className?: string;
}) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800',
        className,
      )}
      title={`Contains ${allergenLabel(warnings)}`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      <span>Contains {allergenLabel(warnings)}</span>
    </span>
  );
}
