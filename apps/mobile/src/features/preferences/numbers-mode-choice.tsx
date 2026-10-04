import { View } from 'react-native';
import type { NumbersMode } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { OptionRow } from './components/option-row';

// "What do you want to keep an eye on?" (WP-08): the two numbers modes a user can
// pick today. Controlled, so it serves both the onboarding goal step (saved with
// the rest of setup) and the Preferences card (saved at once). NONE is reserved
// for WP-16 and is not offered.

export type NumbersModeChoiceValue = Extract<NumbersMode, 'FULL' | 'PROTEIN_ONLY'>;

export const NUMBERS_MODE_COPY = {
  question: 'What do you want to keep an eye on?',
  fullTitle: 'Calories and macros',
  fullDetail: 'Calories, protein, carbs and fat on Today and in the tracker.',
  proteinTitle: 'Just protein',
  proteinDetail: 'One number: protein. Your week still balances the rest in the background.',
} as const;

export function NumbersModeChoice({
  value,
  onChange,
  disabled = false,
  testIDPrefix = 'numbers-mode',
}: {
  value: NumbersModeChoiceValue;
  onChange: (mode: NumbersModeChoiceValue) => void;
  disabled?: boolean;
  testIDPrefix?: string;
}) {
  return (
    <View testID={`${testIDPrefix}-choice`} className="gap-2" accessibilityRole="radiogroup">
      <Text accessibilityRole="header" variant="label">
        {NUMBERS_MODE_COPY.question}
      </Text>
      <OptionRow
        testID={`${testIDPrefix}-full`}
        selected={value === 'FULL'}
        onPress={() => !disabled && onChange('FULL')}
        icon="stats-chart-outline"
        label={NUMBERS_MODE_COPY.fullTitle}
        description={NUMBERS_MODE_COPY.fullDetail}
      />
      <OptionRow
        testID={`${testIDPrefix}-protein`}
        selected={value === 'PROTEIN_ONLY'}
        onPress={() => !disabled && onChange('PROTEIN_ONLY')}
        icon="barbell-outline"
        label={NUMBERS_MODE_COPY.proteinTitle}
        description={NUMBERS_MODE_COPY.proteinDetail}
      />
    </View>
  );
}
