import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { effectiveNumbersMode } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { NumbersModeChoice, type NumbersModeChoiceValue } from './numbers-mode-choice';

// The numbers part of the merged "Your targets" card (WP-08): which numbers to
// keep an eye on (`preferences.setNumbersMode`) and the older "show calories and
// macros on Today" switch (`preferences.setHomeDisplay`, T-04.5). They are
// independent settings: a change to one only calls its own procedure. Each save
// invalidates everything, so Today, the tracker and the plan switch at once and
// switching back to "Calories and macros" restores every number.

export function NumbersSettingsSection({
  initialMode,
  initialShowNutrition,
}: {
  /** `preferences.get().numbersMode`; unknown / NONE read as FULL. */
  initialMode: string | null | undefined;
  /** The resolved "show nutrition on Today" (explicit choice, else goal-derived). */
  initialShowNutrition: boolean;
}) {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<NumbersModeChoiceValue>(effectiveNumbersMode(initialMode));
  const [showNutrition, setShowNutrition] = useState(initialShowNutrition);
  useEffect(() => setMode(effectiveNumbersMode(initialMode)), [initialMode]);
  useEffect(() => setShowNutrition(initialShowNutrition), [initialShowNutrition]);

  const modeMutation = trpc.preferences.setNumbersMode.useMutation({
    meta: { silent: true },
    onSuccess: (res) => {
      setMode(effectiveNumbersMode(res.numbersMode));
      void utils.invalidate();
    },
    onError: () => setMode(effectiveNumbersMode(initialMode)), // roll back the optimistic pick
  });
  const homeMutation = trpc.preferences.setHomeDisplay.useMutation({
    onSuccess: (res) => {
      setShowNutrition(res.showNutritionOnToday);
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();
    },
    onError: () => setShowNutrition((v) => !v), // roll back the optimistic flip
  });

  const failed = modeMutation.isError || homeMutation.isError;

  return (
    <View testID="targets-numbers-settings" className="gap-4">
      <NumbersModeChoice
        value={mode}
        disabled={modeMutation.isPending}
        onChange={(next) => {
          if (next === mode) return;
          setMode(next);
          modeMutation.mutate({ numbersMode: next });
        }}
        testIDPrefix="prefs-numbers-mode"
      />
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="label">Show calories and macros on Today</Text>
          <Text variant="muted" className="mt-1 text-xs">
            Off: Today shows your meals and workouts, without numbers.
          </Text>
        </View>
        <Switch
          testID="prefs-home-display-switch"
          accessibilityLabel="Show calories and macros on Today"
          value={showNutrition}
          disabled={homeMutation.isPending}
          onValueChange={(next) => {
            setShowNutrition(next);
            homeMutation.mutate({ showNutritionOnToday: next });
          }}
          trackColor={{ true: '#944a00', false: '#d1d5db' }}
        />
      </View>
      {failed && (
        <Text testID="prefs-numbers-error" className="text-xs text-red-600">
          {userFacingErrorMessage(modeMutation.error ?? homeMutation.error) ||
            "Couldn't save that. Try again."}
        </Text>
      )}
    </View>
  );
}
