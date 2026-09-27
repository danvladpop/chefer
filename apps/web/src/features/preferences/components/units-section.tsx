import { DISPLAY_CURRENCIES, type DisplayCurrency } from '@chefer/types';
import { Section } from './section';

const CURRENCY_LABELS: Record<DisplayCurrency, string> = {
  EUR: 'Euro (€)',
  USD: 'US dollar ($)',
  GBP: 'British pound (£)',
  RON: 'Romanian leu (RON)',
};

interface UnitsSectionProps {
  preferredUnits: 'METRIC' | 'IMPERIAL';
  deliveryCurrency: DisplayCurrency;
  onUnitsChange: (units: 'METRIC' | 'IMPERIAL') => void;
  /**
   * Not a plain field setter: the parent also keeps the typed weekly budget
   * worth the same amount when the currency changes (P2-4), so it needs the
   * current budget text alongside the new currency.
   */
  onCurrencyChange: (currency: DisplayCurrency) => void;
}

/**
 * Units & currency — free on every tier (backlog P2-6, audit F-DASH-3-2).
 * One unit system for recipes, shopping, body weight and the gym; prices are
 * EUR estimates shown in this currency. Split out of preferences-form.tsx
 * (T-00.13, no behaviour change).
 */
export function UnitsSection({
  preferredUnits,
  deliveryCurrency,
  onUnitsChange,
  onCurrencyChange,
}: UnitsSectionProps) {
  return (
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
                aria-checked={preferredUnits === value}
                onClick={() => onUnitsChange(value)}
                className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  preferredUnits === value
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
            value={deliveryCurrency}
            onChange={(e) => onCurrencyChange(e.target.value as DisplayCurrency)}
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
            {deliveryCurrency !== 'EUR' && ', converted from euros at an approximate rate'}.
          </p>
        </div>
      </div>
    </Section>
  );
}
