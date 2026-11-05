import { View } from 'react-native';
import type { NumbersMode } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { NUMBERS_MODE_COPY } from '@chefer/utils';
import { OptionRow } from './components/option-row';

// "What do you want to keep an eye on?" (WP-08): the numbers modes a user can
// pick. Controlled, so it serves both the onboarding goal step (saved with the
// rest of setup) and the Preferences card (saved at once). Lane E3 adds "Hide
// numbers" (NONE) as an equal third option.

export type NumbersModeChoiceValue = NumbersMode;

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
      <OptionRow
        testID={`${testIDPrefix}-none`}
        selected={value === 'NONE'}
        onPress={() => !disabled && onChange('NONE')}
        icon="eye-off-outline"
        label={NUMBERS_MODE_COPY.noneTitle}
        description={NUMBERS_MODE_COPY.noneDetail}
      />
    </View>
  );
}
