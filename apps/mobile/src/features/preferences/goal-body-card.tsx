import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { GoalStep } from './components/goal-step';
import { MetricsStep } from './components/metrics-step';
import type { ActivityLevel, BiologicalSex, Goal, MetricsValue } from './types';

export interface GoalBodyInitialData {
  goal: Goal | null;
  biologicalSex: BiologicalSex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel | null;
}

export interface GoalBodySavePayload {
  goal?: Goal;
  biologicalSex?: BiologicalSex;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  activityLevel?: ActivityLevel;
}

export interface GoalBodyCardProps {
  initial: GoalBodyInitialData;
  onSave: (payload: GoalBodySavePayload) => void;
  isSaving: boolean;
  isSaved: boolean;
  errorMessage?: string | null;
}

/**
 * "Goal & body" — dogfood feedback #6: goal + body metrics are storable on
 * EVERY tier via preferences.saveProfileBasics (protectedProcedure, not
 * premium), so the dashboard ring/tracker show a real target instead of the
 * 2,000 kcal default. Port of the goal + metrics steps web's onboarding
 * wizard uses for its free tier, and web's PreferencesForm premium goal/
 * metrics sections (apps/web/src/features/preferences/components/preferences-form.tsx),
 * minus the unit toggles (mobile v1).
 */
export function GoalBodyCard({
  initial,
  onSave,
  isSaving,
  isSaved,
  errorMessage,
}: GoalBodyCardProps) {
  const [goal, setGoal] = useState<Goal | null>(initial.goal);
  const [metrics, setMetrics] = useState<MetricsValue>({
    biologicalSex: initial.biologicalSex,
    age: initial.age,
    heightCm: initial.heightCm,
    weightKg: initial.weightKg,
    activityLevel: initial.activityLevel,
  });
  const [ageText, setAgeText] = useState(initial.age?.toString() ?? '');
  const [heightText, setHeightText] = useState(initial.heightCm?.toString() ?? '');
  const [weightText, setWeightText] = useState(initial.weightKg?.toString() ?? '');
  const [loaded, setLoaded] = useState(false);

  // Only hydrate from the server once the query resolves — mirrors the
  // existing preferences.tsx `safetyLoaded` pattern so typing isn't clobbered
  // by a refetch.
  useEffect(() => {
    if (loaded) return;
    if (
      initial.goal === null &&
      initial.biologicalSex === null &&
      initial.age === null &&
      initial.heightCm === null &&
      initial.weightKg === null &&
      initial.activityLevel === null
    ) {
      return;
    }
    setGoal(initial.goal);
    setMetrics({
      biologicalSex: initial.biologicalSex,
      age: initial.age,
      heightCm: initial.heightCm,
      weightKg: initial.weightKg,
      activityLevel: initial.activityLevel,
    });
    setAgeText(initial.age?.toString() ?? '');
    setHeightText(initial.heightCm?.toString() ?? '');
    setWeightText(initial.weightKg?.toString() ?? '');
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per server payload, see comment above
  }, [initial]);

  function handleAgeText(raw: string) {
    setAgeText(raw);
    const n = parseInt(raw, 10);
    setMetrics((m) => ({ ...m, age: raw === '' || isNaN(n) ? null : n }));
  }
  function handleHeightText(raw: string) {
    setHeightText(raw);
    const n = parseFloat(raw.replace(',', '.'));
    setMetrics((m) => ({ ...m, heightCm: raw === '' || isNaN(n) ? null : n }));
  }
  function handleWeightText(raw: string) {
    setWeightText(raw);
    const n = parseFloat(raw.replace(',', '.'));
    setMetrics((m) => ({ ...m, weightKg: raw === '' || isNaN(n) ? null : n }));
  }

  function handleSave() {
    const payload: GoalBodySavePayload = {
      ...(goal !== null && { goal }),
      ...(metrics.biologicalSex !== null && { biologicalSex: metrics.biologicalSex }),
      ...(metrics.age !== null && metrics.age > 0 && { age: metrics.age }),
      ...(metrics.heightCm !== null && metrics.heightCm > 0 && { heightCm: metrics.heightCm }),
      ...(metrics.weightKg !== null && metrics.weightKg > 0 && { weightKg: metrics.weightKg }),
      ...(metrics.activityLevel !== null && { activityLevel: metrics.activityLevel }),
    };
    onSave(payload);
  }

  return (
    <Card testID="preferences-goal-body" className="gap-4">
      <View className="gap-1">
        <Text variant="heading">Goal & body</Text>
        <Text variant="muted" className="text-xs">
          Optional, and available on every plan — with these, your calorie target is computed from
          your body instead of a default.
        </Text>
      </View>

      <View className="gap-2">
        <Text variant="label">Goal</Text>
        <GoalStep value={goal} onChange={setGoal} compact />
      </View>

      <MetricsStep
        value={metrics}
        onChange={setMetrics}
        goal={goal}
        ageText={ageText}
        heightText={heightText}
        weightText={weightText}
        onAgeText={handleAgeText}
        onHeightText={handleHeightText}
        onWeightText={handleWeightText}
      />

      <Button testID="prefs-save-goal-body" loading={isSaving} onPress={handleSave}>
        {isSaved ? 'Saved ✓' : 'Save goal & body'}
      </Button>
      {errorMessage && <Text className="text-xs text-red-600">{errorMessage}</Text>}
    </Card>
  );
}
