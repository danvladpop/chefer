import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, Text } from '@chefer/ui-mobile';
import { cn, WELLNESS_COPY } from '@chefer/utils';
import { ONBOARDING_COPY } from '../../onboarding/copy';
import { GOALS, type Goal } from '../types';
import { OptionRow } from './option-row';

export interface GoalStepProps {
  value: Goal | null;
  onChange: (goal: Goal) => void;
  /** Renders as a compact list instead of the 2-column card grid. */
  compact?: boolean;
  /**
   * T-22.3: the goal/metrics disclaimer. Defaults to shown (the standalone
   * onboarding wizard step has no metrics screen visible alongside it) —
   * goal-body-card.tsx turns it off here since its MetricsStep right below
   * already carries the same line (shown once per screen, not twice).
   */
  showDisclaimer?: boolean;
  /**
   * T-03.2 (AC6): adds a first "Just good food" card — no calorie target,
   * ever, and no body-metric prompts anywhere. Off by default so every
   * OTHER caller of this shared step (Settings, the goal-body card) is
   * unaffected; only the onboarding wizard turns it on.
   */
  showGoodFood?: boolean;
  /** Whether "Just good food" is the current pick — mutually exclusive with `value`. */
  goodFood?: boolean;
  /** Called instead of `onChange` when "Just good food" is tapped. */
  onGoodFood?: () => void;
}

/** T-22.3: a calculator, not a doctor — visible at 1.8x text (AC5), never truncated. */
function Disclaimer() {
  return (
    <Text testID="goal-disclaimer" variant="muted" className="text-xs">
      {WELLNESS_COPY.goalMetricsDisclaimer}
    </Text>
  );
}

/**
 * Goal picker — port of apps/web/src/features/onboarding/components/step-goal.tsx.
 * Same four goals, same copy, same per-goal calorie effect.
 */
export function GoalStep({
  value,
  onChange,
  compact = false,
  showDisclaimer = true,
  showGoodFood = false,
  goodFood = false,
  onGoodFood,
}: GoalStepProps) {
  if (compact) {
    return (
      <View className="gap-2">
        {showGoodFood && (
          <OptionRow
            testID="goal-good-food"
            selected={goodFood}
            onPress={() => onGoodFood?.()}
            icon="restaurant-outline"
            label={ONBOARDING_COPY.goodFoodTitle}
            description={ONBOARDING_COPY.goodFoodDetail}
          />
        )}
        {GOALS.map((g) => (
          <OptionRow
            key={g.value}
            testID={`goal-${g.value}`}
            selected={!goodFood && value === g.value}
            onPress={() => onChange(g.value)}
            icon={g.icon}
            label={g.label}
            description={`${g.description} · ${g.calorieEffect}`}
          />
        ))}
        {showDisclaimer && <Disclaimer />}
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-3">
        {showGoodFood && (
          <Pressable
            testID="goal-good-food"
            accessibilityRole="button"
            accessibilityState={{ selected: goodFood }}
            onPress={() => onGoodFood?.()}
            className={cn(
              'relative w-[47%] items-center gap-2 rounded-xl border p-4',
              goodFood ? 'border-primary bg-accent' : 'border-border bg-card',
            )}
          >
            {goodFood && (
              <View className="absolute right-2 top-2 h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
            <Ionicons
              name="restaurant-outline"
              size={32}
              color={goodFood ? colors.primary : colors.mutedForeground}
            />
            <Text
              className={cn(
                'text-center text-sm font-semibold',
                goodFood ? 'text-primary' : 'text-gray-800',
              )}
            >
              {ONBOARDING_COPY.goodFoodTitle}
            </Text>
            <Text variant="muted" className="text-center text-xs">
              {ONBOARDING_COPY.goodFoodDetail}
            </Text>
          </Pressable>
        )}
        {GOALS.map((g) => {
          const selected = !goodFood && value === g.value;
          return (
            <Pressable
              key={g.value}
              testID={`goal-${g.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(g.value)}
              className={cn(
                'relative w-[47%] items-center gap-2 rounded-xl border p-4',
                selected ? 'border-primary bg-accent' : 'border-border bg-card',
              )}
            >
              {selected && (
                <View className="absolute right-2 top-2 h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              )}
              <Ionicons
                name={g.icon}
                size={32}
                color={selected ? colors.primary : colors.mutedForeground}
              />
              <Text
                className={cn(
                  'text-center text-sm font-semibold',
                  selected ? 'text-primary' : 'text-gray-800',
                )}
              >
                {g.label}
              </Text>
              <Text variant="muted" className="text-center text-xs">
                {g.description}
              </Text>
              <View
                className={cn(
                  'rounded-full px-2 py-0.5',
                  selected ? 'bg-primary/10' : 'bg-gray-100',
                )}
              >
                <Text
                  className={cn('text-xs font-medium', selected ? 'text-primary' : 'text-gray-600')}
                >
                  {g.calorieEffect}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      {showDisclaimer && <Disclaimer />}
    </View>
  );
}
