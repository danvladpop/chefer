import { View } from 'react-native';
import type { NumbersMode } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { useT } from '../../lib/i18n';
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
  const { t } = useT();
  return (
    <View testID={`${testIDPrefix}-choice`} className="gap-2" accessibilityRole="radiogroup">
      <Text accessibilityRole="header" variant="label">
        {t('today.numbersMode.question')}
      </Text>
      <OptionRow
        testID={`${testIDPrefix}-full`}
        selected={value === 'FULL'}
        onPress={() => !disabled && onChange('FULL')}
        icon="stats-chart-outline"
        label={t('today.numbersMode.fullTitle')}
        description={t('today.numbersMode.fullDetail')}
      />
      <OptionRow
        testID={`${testIDPrefix}-protein`}
        selected={value === 'PROTEIN_ONLY'}
        onPress={() => !disabled && onChange('PROTEIN_ONLY')}
        icon="barbell-outline"
        label={t('today.numbersMode.proteinTitle')}
        description={t('today.numbersMode.proteinDetail')}
      />
      <OptionRow
        testID={`${testIDPrefix}-none`}
        selected={value === 'NONE'}
        onPress={() => !disabled && onChange('NONE')}
        icon="eye-off-outline"
        label={t('today.numbersMode.noneTitle')}
        description={t('today.numbersMode.noneDetail')}
      />
    </View>
  );
}
