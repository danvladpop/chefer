import { AlertCircle } from 'lucide-react';
import { cn } from '@chefer/utils';

// PAT-2 — safety states, "Label caveat" (technical-plan.md / synthesis
// 03-ux-design-spec.md §2.2): the risk sits in a bought product (stock,
// oats, soy sauce, curry powder, baking powder, chocolate) — the ingredient
// is kept, but flagged. `compact` is the inline ingredient-line form
// ("Buy certified gluten-free"); the full form is a full-width row. Web
// parity of the mobile `label-caveat.tsx`.

export interface LabelCaveatProps {
  text: string;
  /** Inline, on the ingredient line itself. Default: a full-width row. */
  compact?: boolean;
  className?: string;
}

export function LabelCaveat({ text, compact = false, className }: LabelCaveatProps) {
  return (
    <span
      aria-label={text}
      className={cn(
        'inline-flex items-center gap-1',
        compact
          ? 'shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800'
          : 'w-full items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-800',
        className,
      )}
    >
      <AlertCircle
        className={compact ? 'h-3 w-3 shrink-0' : 'mt-0.5 h-3.5 w-3.5 shrink-0'}
        aria-hidden="true"
      />
      <span className={cn('min-w-0', compact && 'truncate')}>{text}</span>
    </span>
  );
}
