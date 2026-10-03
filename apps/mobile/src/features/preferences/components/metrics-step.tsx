import { Pressable, TextInput, View } from 'react-native';
import {
  bodyMetricsAgeError,
  bodyMetricsHeightError,
  bodyMetricsWeightError,
  MINOR_NO_DEFICIT_NOTE,
} from '@chefer/types';
import { Card, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import { cn, formatKcal, formatNumber, previewCalorieTarget, WELLNESS_COPY } from '@chefer/utils';
import { ACTIVITY_OPTIONS, type Goal, type MetricsValue } from '../types';
import { useNumericChain } from '../use-numeric-chain';
import { OptionRow } from './option-row';

/**
 * Pure preview calc, kept outside the component so the null checks narrow
 * inline (no non-null assertions) — a boolean flag computed separately
 * doesn't narrow the original nullable fields for TypeScript.
 */
function computeCaloriePreview(
  value: MetricsValue,
  goal: Goal | null | undefined,
): { maintenance: number; target: number; deficitBlocked: boolean } | null {
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
  // Below the minimum age there is no estimate at all (R-02): the form shows
  // the age message instead of a number. The same goes for a height or weight
  // outside the plausible range (UX-ONB-05) — an 8 kg weight is a typo, not
  // something to compute a calorie target from.
  if (bodyMetricsAgeError(age) !== null) return null;
  if (bodyMetricsHeightError(heightCm) !== null || bodyMetricsWeightError(weightKg) !== null) {
    return null;
  }
  const { maintenance, target, deficitBlocked } = previewCalorieTarget(
    weightKg,
    heightCm,
    age,
    activityLevel,
    biologicalSex,
    goal ?? null,
  );
  return { maintenance, target, deficitBlocked };
}

export type MetricsFieldErrors = {
  age: string | null;
  height: string | null;
  weight: string | null;
};

/**
 * The inline message (or null) for each typed field — age under 16, and a
 * height or weight outside the shared plausibility bounds (UX-ONB-05), worded
 * in the unit being typed. Callers use it to hold Continue / Save back.
 */
export function metricsFieldErrors(
  value: MetricsValue,
  units: 'METRIC' | 'IMPERIAL' = 'METRIC',
): MetricsFieldErrors {
  return {
    age: bodyMetricsAgeError(value.age),
    height: bodyMetricsHeightError(value.heightCm, units),
    weight: bodyMetricsWeightError(value.weightKg, units),
  };
}

export interface MetricsStepProps {
  value: MetricsValue;
  onChange: (value: MetricsValue) => void;
  /** Selected goal — applies its kcal adjustment to the live preview (web P-3). */
  goal?: Goal | null;
  /**
   * A lifter's protein target and why (preferences only): shown under the
   * calorie estimate, since it replaces the goal's percentage split.
   */
  lifterProtein?: { proteinG: number; note: string } | null;
  /** Local text state for the numeric fields (kept by the caller so
      the input doesn't reformat mid-typing, same reason as web's step-metrics). */
  ageText: string;
  /** cm when metric, FEET when imperial (UX-ONB-05). */
  heightText: string;
  /** Imperial only: the inches beside the feet. Unset in metric. */
  heightInchesText?: string;
  weightText: string;
  onAgeText: (raw: string) => void;
  onHeightText: (raw: string) => void;
  onHeightInchesText?: (raw: string) => void;
  onWeightText: (raw: string) => void;
  /**
   * §2.4, T-03.8 (bug B-43): which unit height/weight are typed in — labels
   * the fields ("Height (cm)" vs a feet + inches pair, UX-ONB-05;
   * "Weight (kg)" vs "Weight (lb)"). Parsing/storing the
   * typed number in the right unit, and switching this when the typed value
   * doesn't fit it (`inferUnitsFromInput`), is the caller's job — this
   * component only reads it for the labels. Omitted defaults to metric (the
   * onboarding wizard always passes it; other callers are unaffected).
   */
  units?: 'METRIC' | 'IMPERIAL';
  /**
   * Runs when "Done" is pressed on the last field (weight), after the keyboard
   * closes — the wizard passes its Continue so Age → Next → Next → Done moves
   * on (UX-ONB-06). Unset: Done just closes the keyboard.
   */
  onSubmit?: () => void;
}

/**
 * Body metrics — port of apps/web/src/features/onboarding/components/step-metrics.tsx.
 * §2.4, T-03.8 (bug B-43, rev 2): height/weight are labelled and parsed in
 * whichever unit the caller passes (`units`) — height as feet + inches in
 * Imperial (UX-ONB-05), weight in lb. The caller owns switching `units` itself when
 * the typed value doesn't fit it (`inferUnitsFromInput`, @chefer/utils).
 */
export function MetricsStep({
  value,
  onChange,
  goal,
  lifterProtein,
  ageText,
  heightText,
  heightInchesText = '',
  weightText,
  onAgeText,
  onHeightText,
  onHeightInchesText,
  onWeightText,
  units = 'METRIC',
  onSubmit,
}: MetricsStepProps) {
  const preview = computeCaloriePreview(value, goal);
  const imperial = units === 'IMPERIAL';
  const errors = metricsFieldErrors(value, units);
  const ageError = errors.age;
  const heightLabel = imperial ? 'Height (ft, in)' : 'Height (cm)';
  const weightLabel = imperial ? 'Weight (lb)' : 'Weight (kg)';
  const heightPlaceholder = imperial ? 'ft' : 'e.g. 175';
  const weightPlaceholder = imperial ? 'e.g. 165' : 'e.g. 75';
  const weightIndex = imperial ? 3 : 2;
  // T-21.5 (CI-14, PAT-11): Return/accessory-bar chains Age → Height →
  // Weight, and each field scrolls clear of the keyboard on focus (a no-op
  // outside a KeyboardAwareScrollView, so this is safe wherever it renders).
  // UX-ONB-06: one accessory bar per field (a shared id with a changing label
  // left a dead bar on iOS), Next → Next → Done.
  const chain = useNumericChain('metrics-step', imperial ? 4 : 3, onSubmit);
  const scrollFieldIntoView = useScrollFieldIntoView();

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
            {...chain.bind(0, { onFocus: scrollFieldIntoView })}
            value={ageText}
            onChangeText={onAgeText}
            keyboardType="number-pad"
            placeholder="e.g. 30"
            placeholderTextColor="#9ca3af"
            accessibilityLabel="Age"
            accessibilityHint={ageError ?? undefined}
            aria-invalid={ageError !== null}
            className={cn(
              'h-11 rounded-md border bg-background px-3 text-base text-foreground',
              ageError !== null ? 'border-red-600' : 'border-input',
            )}
          />
        </View>
        <View className={cn('gap-1', imperial ? 'flex-[2]' : 'flex-1')}>
          <Text variant="label">{heightLabel}</Text>
          <View className="flex-row gap-2">
            <TextInput
              testID="metrics-height"
              {...chain.bind(1, { onFocus: scrollFieldIntoView })}
              value={heightText}
              onChangeText={onHeightText}
              keyboardType={imperial ? 'number-pad' : 'decimal-pad'}
              placeholder={heightPlaceholder}
              placeholderTextColor="#9ca3af"
              accessibilityLabel={imperial ? 'Height, feet' : 'Height, centimetres'}
              accessibilityHint={errors.height ?? undefined}
              aria-invalid={errors.height !== null}
              className={cn(
                'h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-base text-foreground',
                errors.height !== null ? 'border-red-600' : 'border-input',
              )}
            />
            {imperial && (
              <TextInput
                testID="metrics-height-in"
                {...chain.bind(2, { onFocus: scrollFieldIntoView })}
                value={heightInchesText}
                onChangeText={onHeightInchesText}
                keyboardType="decimal-pad"
                placeholder="in"
                placeholderTextColor="#9ca3af"
                accessibilityLabel="Height, inches"
                accessibilityHint={errors.height ?? undefined}
                aria-invalid={errors.height !== null}
                className={cn(
                  'h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-base text-foreground',
                  errors.height !== null ? 'border-red-600' : 'border-input',
                )}
              />
            )}
          </View>
        </View>
        <View className="flex-1 gap-1">
          <Text variant="label">{weightLabel}</Text>
          <TextInput
            testID="metrics-weight"
            {...chain.bind(weightIndex, { onFocus: scrollFieldIntoView })}
            value={weightText}
            onChangeText={onWeightText}
            keyboardType="decimal-pad"
            placeholder={weightPlaceholder}
            placeholderTextColor="#9ca3af"
            accessibilityLabel={imperial ? 'Weight, pounds' : 'Weight, kilograms'}
            accessibilityHint={errors.weight ?? undefined}
            aria-invalid={errors.weight !== null}
            className={cn(
              'h-11 rounded-md border bg-background px-3 text-base text-foreground',
              errors.weight !== null ? 'border-red-600' : 'border-input',
            )}
          />
        </View>
      </View>

      {ageError !== null && (
        <Text
          testID="metrics-age-error"
          accessibilityRole="alert"
          className="-mt-3 text-xs text-red-600"
        >
          {ageError}
        </Text>
      )}
      {errors.height !== null && (
        <Text
          testID="metrics-height-error"
          accessibilityRole="alert"
          className="-mt-3 text-xs text-red-600"
        >
          {errors.height}
        </Text>
      )}
      {errors.weight !== null && (
        <Text
          testID="metrics-weight-error"
          accessibilityRole="alert"
          className="-mt-3 text-xs text-red-600"
        >
          {errors.weight}
        </Text>
      )}

      {chain.bars}

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
            <Text className="text-3xl font-bold text-primary">{formatNumber(preview.target)}</Text>
            <Text variant="muted" className="text-center text-xs">
              {goal
                ? `kcal / day · ${formatKcal(preview.maintenance)} maintenance`
                : 'kcal / day · Mifflin-St Jeor estimate'}
            </Text>
            {preview.deficitBlocked && (
              <Text
                testID="metrics-minor-note"
                className="mt-1 text-center text-xs text-foreground"
              >
                {MINOR_NO_DEFICIT_NOTE}
              </Text>
            )}
            {lifterProtein && (
              <View testID="metrics-lifter-protein" className="mt-2 items-center gap-0.5">
                <Text className="text-base font-semibold text-foreground">
                  {`${lifterProtein.proteinG} g protein / day`}
                </Text>
                <Text variant="muted" className="text-center text-xs">
                  {lifterProtein.note}
                </Text>
              </View>
            )}
          </>
        ) : ageError !== null ? (
          <Text variant="muted" className="text-center text-sm">
            {ageError}
          </Text>
        ) : errors.height !== null || errors.weight !== null ? (
          <Text variant="muted" className="text-center text-sm">
            Fix your height and weight to see your estimated daily calorie target.
          </Text>
        ) : (
          <Text variant="muted" className="text-center text-sm">
            Fill in your age, height, and weight to see your estimated daily calorie target.
          </Text>
        )}
      </Card>

      {/* T-22.3: a calculator, not a doctor — visible at 1.8x text (AC5), never
          truncated. */}
      <Text testID="metrics-disclaimer" variant="muted" className="text-xs">
        {WELLNESS_COPY.goalMetricsDisclaimer}
      </Text>
    </View>
  );
}
