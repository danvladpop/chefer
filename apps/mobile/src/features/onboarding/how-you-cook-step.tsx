import { useEffect, useState } from 'react';
import { ActivityIndicator, Switch, View } from 'react-native';
import { DISPLAY_CURRENCIES, type DisplayCurrency, type PlanShape } from '@chefer/types';
import { ChipGroup, SegmentedControl, Text } from '@chefer/ui-mobile';
import { defaultsForRegion, detectRegion } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { HowYouCookForm } from '../meal-plan/how-you-cook-form';
import { ONBOARDING_COPY } from './copy';

// Step — How you cook (UX-07 §1, wired for onboarding by UX-03/T-03.3). The
// same HowYouCookForm as Settings and the Plan tab's "Plan settings" sheet,
// plus currency/units (pre-selected from the device region, CI-24) and the
// once-only "Plan my next week automatically every Sunday?" switch
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

export interface HowYouCookStepValue {
  shape: (PlanShape & { leftovers: boolean }) | null;
  currency: DisplayCurrency;
  units: 'METRIC' | 'IMPERIAL';
  autoPlanWeekly: boolean;
}

export interface HowYouCookStepProps {
  value: HowYouCookStepValue;
  onChange: (value: HowYouCookStepValue) => void;
  isPremium: boolean;
}

export function HowYouCookStep({ value, onChange, isPremium }: HowYouCookStepProps) {
  const { data } = trpc.mealPlan.getShape.useQuery();
  const [regionApplied, setRegionApplied] = useState(false);

  // Hydrate the plan shape from the server once; pre-select currency/units
  // from the device region the first time this step is ever shown (the
  // user can always change either chip — this only sets the starting pick).
  useEffect(() => {
    if (data && !value.shape) onChange({ ...value, shape: data });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, [data]);

  useEffect(() => {
    if (regionApplied) return;
    setRegionApplied(true);
    const { preferredUnits, currency } = defaultsForRegion(detectRegion());
    onChange({ ...value, units: preferredUnits, currency });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
  }, []);

  if (!value.shape) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator size="large" color="#944a00" />
      </View>
    );
  }
  const shape = value.shape;

  return (
    <View className="gap-5">
      <HowYouCookForm
        shape={shape}
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
