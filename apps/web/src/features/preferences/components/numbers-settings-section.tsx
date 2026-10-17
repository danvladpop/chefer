'use client';

import { useEffect, useState } from 'react';
import {
  NumbersModeChoice,
  type NumbersModeChoiceValue,
} from '@/features/numbers-mode/numbers-mode-choice';
import { trpc } from '@/lib/trpc';
import { effectiveNumbersMode } from '@chefer/types';
import { Switch } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

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
    meta: { silent: true },
    onSuccess: (res) => {
      setShowNutrition(res.showNutritionOnToday);
      void utils.preferences.invalidate();
      void utils.dashboard.invalidate();
    },
    onError: () => setShowNutrition((v) => !v), // roll back the optimistic flip
  });

  const failed = modeMutation.isError || homeMutation.isError;

  return (
    <div data-testid="targets-numbers-settings" className="mt-4 space-y-4">
      <NumbersModeChoice
        value={mode}
        disabled={modeMutation.isPending}
        onChange={(next) => {
          if (next === mode) return;
          setMode(next);
          modeMutation.mutate({ numbersMode: next });
        }}
        testIdPrefix="prefs-numbers-mode"
      />
      <div data-testid="prefs-home-display" className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="home-display-label" className="text-sm font-semibold text-foreground">
            Show calories and macros on Today
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Off: Today shows your meals and workouts, without numbers.
          </p>
        </div>
        <Switch
          data-testid="prefs-home-display-switch"
          checked={showNutrition}
          onCheckedChange={(next) => {
            setShowNutrition(next);
            homeMutation.mutate({ showNutritionOnToday: next });
          }}
          aria-labelledby="home-display-label"
          disabled={homeMutation.isPending}
        />
      </div>
      {failed && (
        <p role="alert" data-testid="prefs-numbers-error" className="text-xs text-red-600">
          {userFacingErrorMessage(modeMutation.error ?? homeMutation.error) ||
            "Couldn't save that. Try again."}
        </p>
      )}
    </div>
  );
}
