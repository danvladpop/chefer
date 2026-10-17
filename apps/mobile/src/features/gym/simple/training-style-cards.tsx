import { View } from 'react-native';
import { TRAINING_STYLE_ANSWERS } from '@chefer/types';
import { PressableScale, Text, useThemeColors } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import type { TrainingStyleAnswerKey } from './simple-helpers';

// "How do you like to train?" (simple training mode §6.1) — the three shared
// answers as large radio cards, for gym setup and onboarding V4's Train step.
// "I follow a program…" is "Track my progress"; the other two "Keep it simple".
// MO-01 press feedback (PressableScale); the selected card gets the brand
// border and a filled check.

export function TrainingStyleCards({
  value,
  onChange,
  testIDPrefix,
}: {
  value: TrainingStyleAnswerKey | null;
  onChange: (key: TrainingStyleAnswerKey) => void;
  testIDPrefix: string;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" className="gap-2.5" testID={`${testIDPrefix}-answers`}>
      {TRAINING_STYLE_ANSWERS.map((answer) => {
        const selected = value === answer.key;
        return (
          <PressableScale
            key={answer.key}
            pressScale="card"
            testID={`${testIDPrefix}-${answer.key}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={answer.label}
            onPress={() => onChange(answer.key)}
            className={cn(
              'min-h-16 flex-row items-center gap-3 rounded-card p-4',
              selected
                ? 'border-2 border-brand bg-brand-tint'
                : 'border border-separator bg-surface',
            )}
          >
            <Text className="min-w-0 flex-1 text-headline font-semibold text-label">
              {answer.label}
            </Text>
            <View
              className={cn(
                'h-6 w-6 items-center justify-center rounded-full',
                selected ? 'bg-brand' : 'border-2 border-separator',
              )}
            >
              {selected ? <Icon name="checkmark" color={colors.onBrand} size={16} /> : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
