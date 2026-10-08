import type { DisplayCurrency } from '@chefer/types';
import {
  currencySymbol,
  parseWeeklyBudget,
  weeklyBudgetCap,
  weeklyBudgetCapLabel,
} from '@chefer/utils';
import { Section } from './section';

interface BudgetSectionProps {
  /** Free users never see this section at all (server-gated regardless). */
  isPremium: boolean;
  weeklyBudget: string;
  deliveryCurrency: DisplayCurrency;
  onChange: (weeklyBudget: string) => void;
}

/**
 * Weekly budget (P2-4) — premium only; generation treats it as a hard
 * ceiling. Split out of preferences-form.tsx (T-00.13, no behaviour change:
 * free users still see nothing here, same as the inline `{isPremium && ...}`
 * block it replaces — bug B-10's read-only fix is the mobile counterpart,
 * `app/preferences.tsx`, which DOES keep the field visible for free users).
 */
export function BudgetSection({
  isPremium,
  weeklyBudget,
  deliveryCurrency,
  onChange,
}: BudgetSectionProps) {
  if (!isPremium) return null;
  // UX-ACC-23: validate live and show the cap, instead of silently storing the cap.
  const parsed = parseWeeklyBudget(weeklyBudget, deliveryCurrency);

  return (
    <Section>
      <h2 className="mb-1 text-base font-semibold">Weekly Budget</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Keep my week under a set amount — the AI chef plans affordable meals to stay within it.
        Leave empty for no budget.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-lg font-medium text-muted-foreground">
          {currencySymbol(deliveryCurrency)}
        </span>
        <input
          type="number"
          min={1}
          max={weeklyBudgetCap(deliveryCurrency)}
          step="1"
          value={weeklyBudget}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Weekly budget"
          aria-invalid={parsed.kind === 'error' ? 'true' : undefined}
          aria-describedby="budget-hint"
          placeholder="e.g. 60"
          className="w-32 rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-sm text-muted-foreground">per week</span>
      </div>
      {parsed.kind === 'error' ? (
        <p id="budget-hint" role="alert" className="mt-2 text-sm text-destructive">
          {parsed.message}
        </p>
      ) : (
        <p id="budget-hint" className="mt-2 text-sm text-muted-foreground">
          {weeklyBudgetCapLabel(deliveryCurrency)}.
        </p>
      )}
    </Section>
  );
}
