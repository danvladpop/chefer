import { Pressable, TextInput, View } from 'react-native';
import { bodyMetricsAgeError, MINOR_NO_DEFICIT_NOTE } from '@chefer/types';
import {
  Card,
  NumericReturnBar,
  Text,
  useFieldChain,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { cn, previewCalorieTarget, WELLNESS_COPY } from '@chefer/utils';
import { ACTIVITY_OPTIONS, type Goal, type MetricsValue } from '../types';
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
  // the age message instead of a number.
  if (bodyMetricsAgeError(age) !== null) return null;
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
  /** Local text state for the three numeric fields (kept by the caller so
      the input doesn't reformat mid-typing, same reason as web's step-metrics). */
  ageText: string;
  heightText: string;
  weightText: string;
  onAgeText: (raw: string) => void;
  onHeightText: (raw: string) => void;
  onWeightText: (raw: string) => void;
  /**
   * §2.4, T-03.8 (bug B-43): which unit height/weight are typed in — labels
   * the fields ("Height (cm)" vs "Height (in)", single-field inches rather
   * than a ft/in split; "Weight (kg)" vs "Weight (lb)"). Parsing/storing the
   * typed number in the right unit, and switching this when the typed value
   * doesn't fit it (`inferUnitsFromInput`), is the caller's job — this
   * component only reads it for the labels. Omitted defaults to metric (the
   * onboarding wizard always passes it; other callers are unaffected).
   */
  units?: 'METRIC' | 'IMPERIAL';
}

/** iOS accessory bar id shared by the three numeric fields below (T-21.5). */
const NUMERIC_BAR_ID = 'metrics-step-numeric-bar';

/**
 * Body metrics — port of apps/web/src/features/onboarding/components/step-metrics.tsx.
 * §2.4, T-03.8 (bug B-43, rev 2): height/weight are labelled and parsed in
 * whichever unit the caller passes (`units`) — height as a single inches
 * field in Imperial (no ft/in split, to keep this a drop-in for the metric
 * v1 layout), weight in lb. The caller owns switching `units` itself when
 * the typed value doesn't fit it (`inferUnitsFromInput`, @chefer/utils).
 */
export function MetricsStep({
  value,
  onChange,
  goal,
  lifterProtein,
  ageText,
  heightText,
  weightText,
  onAgeText,
  onHeightText,
  onWeightText,
  units = 'METRIC',
}: MetricsStepProps) {
  const preview = computeCaloriePreview(value, goal);
  const ageError = bodyMetricsAgeError(value.age);
  const heightLabel = units === 'IMPERIAL' ? 'Height (in)' : 'Height (cm)';
  const weightLabel = units === 'IMPERIAL' ? 'Weight (lb)' : 'Weight (kg)';
  const heightPlaceholder = units === 'IMPERIAL' ? 'e.g. 69' : 'e.g. 175';
  const weightPlaceholder = units === 'IMPERIAL' ? 'e.g. 165' : 'e.g. 75';
  // T-21.5 (CI-14, PAT-11): Return/accessory-bar chains Age → Height →
  // Weight, and each field scrolls clear of the keyboard on focus (a no-op
  // outside a KeyboardAwareScrollView, so this is safe wherever it renders).
  const chain = useFieldChain(3);
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
            inputAccessoryViewID={NUMERIC_BAR_ID}
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
        <View className="flex-1 gap-1">
          <Text variant="label">{heightLabel}</Text>
          <TextInput
            testID="metrics-height"
            {...chain.bind(1, { onFocus: scrollFieldIntoView })}
            inputAccessoryViewID={NUMERIC_BAR_ID}
            value={heightText}
            onChangeText={onHeightText}
            keyboardType="decimal-pad"
            placeholder={heightPlaceholder}
            placeholderTextColor="#9ca3af"
            className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
          />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="label">{weightLabel}</Text>
          <TextInput
            testID="metrics-weight"
            {...chain.bind(2, { onFocus: scrollFieldIntoView })}
            inputAccessoryViewID={NUMERIC_BAR_ID}
            value={weightText}
            onChangeText={onWeightText}
            keyboardType="decimal-pad"
            placeholder={weightPlaceholder}
            placeholderTextColor="#9ca3af"
            className="h-11 rounded-md border border-input bg-background px-3 text-base text-foreground"
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

      <NumericReturnBar
        nativeID={NUMERIC_BAR_ID}
        testID="metrics-numeric-bar"
        label={chain.isLastFocused ? 'Done' : 'Next'}
        onPress={() => chain.focusNext()}
      />

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
              {preview.target.toLocaleString('en-US')}
            </Text>
            <Text variant="muted" className="text-center text-xs">
              {goal
                ? `kcal / day · ${preview.maintenance.toLocaleString('en-US')} maintenance`
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
