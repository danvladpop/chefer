import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OnboardingIntent } from '@chefer/types';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// Step 0: "What brings you here?" (backlog P2-3, audit F-PM-6) — port of
// web's step-intent.tsx. Routes each audience to its first screen.

export const INTENT_OPTIONS: {
  value: OnboardingIntent;
  title: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    value: 'EAT_BETTER',
    title: 'Eat better',
    detail: 'Plan my week, shop and cook — for me.',
    icon: 'nutrition-outline',
  },
  {
    value: 'HOUSEHOLD',
    title: 'Feed my household',
    detail: 'One safe plan for everyone at my table, allergies included.',
    icon: 'people-outline',
  },
  {
    value: 'TRAIN',
    title: 'Train',
    detail: 'Workouts that progress every week. I’ll set up food later.',
    icon: 'barbell-outline',
  },
];

export function IntentStep({
  value,
  onChange,
}: {
  value: OnboardingIntent | null;
  onChange: (intent: OnboardingIntent) => void;
}) {
  return (
    <View className="gap-3">
      <Text variant="muted" className="text-sm">
        We&apos;ll start where it matters to you. You can use everything either way.
      </Text>
      <View accessibilityRole="radiogroup" className="gap-3">
        {INTENT_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <PressableScale
              key={option.value}
              pressScale="card"
              testID={`onboarding-intent-${option.value}`}
              accessibilityRole="radio"
              accessibilityLabel={option.title}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              className={cn(
                'min-h-11 flex-row items-center gap-4 rounded-xl border-2 p-4',
                selected ? 'border-primary bg-accent' : 'border-border bg-white',
              )}
            >
              <View
                className={cn(
                  'h-11 w-11 items-center justify-center rounded-xl',
                  selected ? 'bg-primary' : 'bg-accent',
                )}
              >
                <Ionicons name={option.icon} size={22} color={selected ? '#ffffff' : '#944a00'} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="font-semibold text-gray-900">{option.title}</Text>
                <Text variant="muted" className="text-sm">
                  {option.detail}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}
