'use client';

import { ShieldCheck } from 'lucide-react';
import type { SafetyChecks } from '@chefer/types';
import { cantCheckLine, checkedForLineText, cn } from '@chefer/utils';

// PAT-2 — "Checked for …" (UX-02 §2, T-02.2/T-02.3): the full-line form for
// recipe detail (under the tag chips) and cook mode (top of the ingredient
// list). Renders nothing when the table has no rules AND nothing to report —
// AC1 (T-02.3). The caller is responsible for the "never both" rule (AC3):
// render the conflict banner instead of this line, not both.

export interface CheckedForLineProps {
  checks: Pick<SafetyChecks, 'checked' | 'unchecked'>;
  onOpenSheet?: () => void;
  className?: string;
}

export function CheckedForLine({ checks, onOpenSheet, className }: CheckedForLineProps) {
  const { checked, unchecked } = checks;
  if (checked.length === 0 && unchecked.length === 0) return null;

  const mainLine = checked.length > 0 ? checkedForLineText(checked) : null;
  const content = (
    <div className="flex flex-col gap-1">
      {mainLine ? (
        <span className="flex min-w-0 items-start gap-1.5 text-sm text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8a7560]" aria-hidden="true" />
          <span className="min-w-0">{mainLine}</span>
        </span>
      ) : null}
      {unchecked.map((term) => (
        <span key={term} className="pl-[22px] text-xs text-amber-700">
          {cantCheckLine(term)}
        </span>
      ))}
    </div>
  );

  if (!onOpenSheet) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpenSheet}
      className={cn(
        'min-h-11 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      aria-label={mainLine ? `${checkedForLineText(checked)}. Opens details.` : undefined}
    >
      {content}
    </button>
  );
}
