import { StatTile, useThemeColors } from '@chefer/ui-mobile';
import type { SessionKcalCopy } from '@chefer/utils';
import { Icon } from '../../../components/icon';

// Calories-burned tile for Today's training card and the v2 workout summary.
// The caption and the spoken label always say whether the number is our
// estimate or the user's own (`sessionKcalCopy`), and the hint says how an
// estimate was made.

export function BurnTile({ copy, testID }: { copy: SessionKcalCopy; testID: string }) {
  const colors = useThemeColors();
  return (
    <StatTile
      testID={testID}
      icon={<Icon name="flame" color={colors.brand} size={18} />}
      value={copy.value}
      label={copy.label}
      accessibilityLabel={copy.spoken}
      accessibilityHint={copy.hint}
    />
  );
}
