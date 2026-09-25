import { Pressable, View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { CUISINE_OPTIONS } from '../types';

const MEALS_OPTIONS = [2, 3, 4, 5] as const;
const SERVING_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

export interface CuisineStepValue {
  cuisinePreferences: string[];
  mealsPerDay: number;
  servingSize: number;
}

export interface CuisineStepProps {
  value: CuisineStepValue;
  onChange: (value: CuisineStepValue) => void;
}

/**
 * Cuisine & meal cadence — premium-only (port of web's step-cuisine.tsx).
 * Selections are optional, matching web's "select all that apply — or skip".
 */
export function CuisineStep({ value, onChange }: CuisineStepProps) {
  function toggleCuisine(cuisine: string) {
    const next = value.cuisinePreferences.includes(cuisine)
      ? value.cuisinePreferences.filter((c) => c !== cuisine)
      : [...value.cuisinePreferences, cuisine];
    onChange({ ...value, cuisinePreferences: next });
  }

  const pillCls = (active: boolean) =>
    cn(
      'min-h-9 flex-row items-center gap-1.5 rounded-full border px-3',
      active ? 'border-primary bg-accent' : 'border-border bg-white',
    );

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text variant="label">Favourite cuisines</Text>
        <Text variant="muted" className="text-xs">
          Select all that apply — or skip.
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {CUISINE_OPTIONS.map((c) => {
            const selected = value.cuisinePreferences.includes(c.value);
            return (
              <Pressable
                key={c.value}
                testID={`cuisine-${c.value}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => toggleCuisine(c.value)}
                className={pillCls(selected)}
              >
                <Text>{c.icon}</Text>
                <Text
                  className={cn(
                    'text-sm',
                    selected ? 'font-semibold text-primary' : 'text-gray-700',
                  )}
                >
                  {c.value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2">
        <Text variant="label">Meals per day</Text>
        <View className="flex-row gap-2">
          {MEALS_OPTIONS.map((n) => (
            <Pressable
              key={n}
              testID={`meals-${n}`}
              accessibilityRole="button"
              accessibilityState={{ selected: value.mealsPerDay === n }}
              onPress={() => onChange({ ...value, mealsPerDay: n })}
              className={cn(
                'h-11 flex-1 items-center justify-center rounded-md border',
                value.mealsPerDay === n ? 'border-primary bg-primary' : 'border-border bg-white',
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  value.mealsPerDay === n ? 'text-primary-foreground' : 'text-gray-600',
                )}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text variant="label">Serving size</Text>
        <Text variant="muted" className="text-xs">
          How many people are you cooking for?
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {SERVING_OPTIONS.map((n) => (
            <Pressable
              key={n}
              testID={`serving-${n}`}
              accessibilityRole="button"
              accessibilityState={{ selected: value.servingSize === n }}
              onPress={() => onChange({ ...value, servingSize: n })}
              className={cn(
                'h-11 w-14 items-center justify-center rounded-md border',
                value.servingSize === n ? 'border-primary bg-primary' : 'border-border bg-white',
              )}
            >
              <Text
                className={cn(
                  'text-sm font-semibold',
                  value.servingSize === n ? 'text-primary-foreground' : 'text-gray-600',
                )}
              >
                {n === 6 ? '6+' : n}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
