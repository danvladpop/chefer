import { useEffect } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { DISPLAY_CURRENCIES, type DisplayCurrency, type PlanShape } from '@chefer/types';
import { ChipGroup, colors, SegmentedControl, Text } from '@chefer/ui-mobile';
import { trpc } from '../../lib/trpc';
import { HowYouCookForm } from '../meal-plan/how-you-cook-form';
import { ONBOARDING_COPY } from './copy';

// Step — How you cook (UX-07 §1, wired for onboarding by UX-03/T-03.3). The
// same HowYouCookForm as Settings and the Plan tab's "Plan settings" sheet,
// plus currency/units (pre-selected from the device region, CI-24 — by the
// wizard's initial state, UX-ONB-04, never by this step) and the once-only "Plan my next week automatically every Sunday?" switch
// (T-03.9, default off — ⚖ D-13).

const CURRENCY_OPTIONS = DISPLAY_CURRENCIES.map((value) => ({
  value,
  label: value,
  testID: `how-you-cook-currency-${value}`,
}));

const UNITS_OPTIONS = [
  { value: 'METRIC' as const, label: 'Metric (g, kg)', testID: 'how-you-cook-units-metric' },
  { value: 'IMPERIAL' as const, label: 'Imperial (oz, lb)', testID: 'how-you-cook-units-imperial' },
];

// UX-ONB-10: an untinted Switch is the platform's teal on Android.
const SWITCH_TRACK = { true: colors.primary, false: colors.neutral };

export interface HowYouCookStepValue {
  shape: (PlanShape & { leftovers: boolean }) | null;
  currency: DisplayCurrency;
  units: 'METRIC' | 'IMPERIAL';
  autoPlanWeekly: boolean;
}

export interface HowYouCookStepProps {
  value: HowYouCookStepValue;
  /**
   * Also accepts a functional updater (`setState`-style), same as React's
   * own `Dispatch<SetStateAction<T>>` — the mount-time shape hydration must
   * never clobber a write made in the same commit with a stale `value`
   * closure, so it uses the functional form. A caller passing
   * `setHowYouCook` directly already supports both shapes; a caller passing
   * a plain value-setter callback needs to accept the updater form too
   * (`(prev) => next`).
   */
  onChange: (
    value: HowYouCookStepValue | ((prev: HowYouCookStepValue) => HowYouCookStepValue),
  ) => void;
  isPremium: boolean;
}

export function HowYouCookStep({ value, onChange, isPremium }: HowYouCookStepProps) {
  const { data } = trpc.mealPlan.getShape.useQuery();
  // UX-PLAN-12: a household's "Cooking for" is read-only, from the table.
  const { data: householdMembers } = trpc.household.list.useQuery(undefined, {
    staleTime: 60_000,
  });

  // Hydrate the plan shape from the server once. Currency and units are NOT
  // touched here: the device-region starting pick lives in the wizard's initial
  // state, so re-mounting this step (Back, then forward) keeps the user's choice.
  useEffect(() => {
    if (!data) return;
    onChange((prev) => (prev.shape ? prev : { ...prev, shape: data }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, [data]);

  if (!value.shape) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  const shape = value.shape;

  return (
    <View className="gap-5">
      <HowYouCookForm
        shape={shape}
        householdMembers={householdMembers}
        onChange={(next) => onChange({ ...value, shape: { ...shape, ...next } })}
      />

      {isPremium && (
        <View className="gap-2 border-t border-border pt-4">
          <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
            Options
          </Text>
          <View className="min-h-11 flex-row items-center justify-between">
            <Text className="flex-1 text-sm text-gray-700">
              Cook once, eat twice (leftover lunches)
            </Text>
            <Switch
              testID="how-you-cook-leftovers"
              value={shape.leftovers}
              trackColor={SWITCH_TRACK}
              accessibilityLabel="Cook once, eat twice (leftover lunches)"
              onValueChange={(leftovers) => onChange({ ...value, shape: { ...shape, leftovers } })}
            />
          </View>
        </View>
      )}

      <View className="gap-2 border-t border-border pt-4">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">
          Prices in
        </Text>
        <ChipGroup
          testID="how-you-cook-currency"
          options={CURRENCY_OPTIONS}
          value={[value.currency]}
          onChange={(vals) => vals[0] && onChange({ ...value, currency: vals[0] })}
        />
        <Text variant="muted" className="text-xs">
          {ONBOARDING_COPY.currencyHelper}
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase tracking-widest text-gray-500">Units</Text>
        <SegmentedControl
          testID="how-you-cook-units"
          accessibilityLabel="Units"
          options={UNITS_OPTIONS}
          value={value.units}
          onChange={(units) => onChange({ ...value, units })}
        />
      </View>

      <View className="gap-1 border-t border-border pt-4">
        <View className="min-h-11 flex-row items-center justify-between">
          <Text className="flex-1 pr-3 text-sm text-gray-700">
            {ONBOARDING_COPY.autoPlanQuestion}
          </Text>
          <Switch
            testID="how-you-cook-auto-plan"
            value={value.autoPlanWeekly}
            trackColor={SWITCH_TRACK}
            accessibilityLabel={ONBOARDING_COPY.autoPlanQuestion}
            onValueChange={(autoPlanWeekly) => onChange({ ...value, autoPlanWeekly })}
          />
        </View>
        <Text variant="muted" className="text-xs">
          {ONBOARDING_COPY.autoPlanHelper}
        </Text>
      </View>
    </View>
  );
}
