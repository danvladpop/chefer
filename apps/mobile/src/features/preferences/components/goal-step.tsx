import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { GOALS, type Goal } from '../types';
import { OptionRow } from './option-row';

export interface GoalStepProps {
  value: Goal | null;
  onChange: (goal: Goal) => void;
  /** Renders as a compact list instead of the 2-column card grid. */
  compact?: boolean;
}

/**
 * Goal picker — port of apps/web/src/features/onboarding/components/step-goal.tsx.
 * Same four goals, same copy, same per-goal calorie effect.
 */
export function GoalStep({ value, onChange, compact = false }: GoalStepProps) {
  if (compact) {
    return (
      <View className="gap-2">
        {GOALS.map((g) => (
          <OptionRow
            key={g.value}
            testID={`goal-${g.value}`}
            selected={value === g.value}
            onPress={() => onChange(g.value)}
            icon={g.icon}
            label={g.label}
            description={`${g.description} · ${g.calorieEffect}`}
          />
        ))}
      </View>
    );
  }

  return (
    <View className="flex-row flex-wrap gap-3">
      {GOALS.map((g) => {
        const selected = value === g.value;
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
            <Text className="text-3xl">{g.icon}</Text>
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
              className={cn('rounded-full px-2 py-0.5', selected ? 'bg-primary/10' : 'bg-gray-100')}
            >
              <Text
                className={cn(
                  'text-[11px] font-medium',
                  selected ? 'text-primary' : 'text-gray-600',
                )}
              >
                {g.calorieEffect}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
