import { Pressable, TextInput, View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import {
  ACTIVITY_OPTIONS,
  estimateCalories,
  estimateCalorieTarget,
  type Goal,
  type MetricsValue,
} from '../types';
import { OptionRow } from './option-row';

/**
 * Pure preview calc, kept outside the component so the null checks narrow
 * inline (no non-null assertions) — a boolean flag computed separately
 * doesn't narrow the original nullable fields for TypeScript.
 */
function computeCaloriePreview(
  value: MetricsValue,
  goal: Goal | null | undefined,
): { maintenance: number; target: number } | null {
  const { age, heightCm, weightKg, activityLevel, biologicalSex } = value;
  if (
    age === null ||
    heightCm === null ||
    weightKg === null ||
    age <= 0 ||
    heightCm <= 0 ||
    weightKg <= 0
  ) {
    return null;
  }
  return {
    maintenance: estimateCalories(weightKg, heightCm, age, activityLevel, biologicalSex),
    target: estimateCalorieTarget(
      weightKg,
      heightCm,
      age,
      activityLevel,
      biologicalSex,
      goal ?? null,
    ),
  };
}

export interface MetricsStepProps {
  value: MetricsValue;
  onChange: (value: MetricsValue) => void;
  /** Selected goal — applies its kcal adjustment to the live preview (web P-3). */
  goal?: Goal | null;
  /** Local text state for the three numeric fields (kept by the caller so
      the input doesn't reformat mid-typing, same reason as web's step-metrics). */
  ageText: string;
  heightText: string;
  weightText: string;
  onAgeText: (raw: string) => void;
  onHeightText: (raw: string) => void;
  onWeightText: (raw: string) => void;
}

/**
 * Body metrics — port of apps/web/src/features/onboarding/components/step-metrics.tsx
 * (metric units only — no ft/in or lbs toggle on mobile v1).
 */
export function MetricsStep({
  value,
  onChange,
  goal,
  ageText,
  heightText,
  weightText,
  onAgeText,
  onHeightText,
  onWeightText,
}: MetricsStepProps) {
  const preview = computeCaloriePreview(value, goal);

  return (
    <View className="gap-5">
      {/* Biological sex */}
      <View className="gap-1.5">
        <Text variant="label">Biological sex</Text>
        <Text variant="muted" className="text-xs">
          Used for accurate calorie calculation.
        </Text>
        <View className="flex-row gap-2">
          {(['MALE', 'FEMALE'] as const).map((sex) => {
            const selected = value.biologicalSex === sex;
            return (
              <Pressable
                key={sex}
                testID={`metrics-sex-${sex}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange({ ...value, biologicalSex: sex })}
                className={cn(
                  'h-11 flex-1 items-center justify-center rounded-md border',
                  selected ? 'border-primary bg-primary' : 'border-border bg-white',
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    selected ? 'text-primary-foreground' : 'text-gray-600',
                  )}
                >
                  {sex === 'MALE' ? 'Male' : 'Female'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Age / height / weight */}
      <View className="flex-row gap-2">
        <View className="flex-1 gap-1">
          <Text variant="label">Age</Text>
          <TextInput
            testID="metrics-age"
            value={ageText}
            onChangeText={onAgeText}
            keyboardType="number-pad"
            placeholder="e.g. 30"
            placeholderTextColor="#9ca3af"
            className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="label">Height (cm)</Text>
          <TextInput
            testID="metrics-height"
            value={heightText}
            onChangeText={onHeightText}
            keyboardType="decimal-pad"
            placeholder="e.g. 175"
            placeholderTextColor="#9ca3af"
            className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="label">Weight (kg)</Text>
          <TextInput
            testID="metrics-weight"
            value={weightText}
            onChangeText={onWeightText}
            keyboardType="decimal-pad"
            placeholder="e.g. 75"
            placeholderTextColor="#9ca3af"
            className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        </View>
      </View>

      {/* Activity level */}
      <View className="gap-1.5">
        <Text variant="label">Activity level</Text>
        <View className="gap-2">
          {ACTIVITY_OPTIONS.map((a) => (
            <OptionRow
              key={a.value}
              testID={`metrics-activity-${a.value}`}
              selected={value.activityLevel === a.value}
              onPress={() => onChange({ ...value, activityLevel: a.value })}
              label={a.label}
              description={a.description}
            />
          ))}
        </View>
      </View>

      {/* Live calorie estimate */}
      <Card
        testID="metrics-calorie-preview"
        className={cn(
          'items-center gap-1 border-2',
          preview !== null ? 'border-primary/30 bg-accent' : 'border-dashed',
        )}
      >
        {preview !== null ? (
          <>
            <Text variant="muted" className="text-xs">
              Estimated daily calorie target
            </Text>
            <Text className="text-3xl font-bold text-primary">
              {preview.target.toLocaleString()}
            </Text>
            <Text variant="muted" className="text-center text-xs">
              {goal
                ? `kcal / day · ${preview.maintenance.toLocaleString()} maintenance`
                : 'kcal / day · Mifflin-St Jeor estimate'}
            </Text>
          </>
        ) : (
          <Text variant="muted" className="text-center text-sm">
            Fill in your age, height, and weight to see your estimated daily calorie target.
          </Text>
        )}
      </Card>
    </View>
  );
}
