import { router } from 'expo-router';
import { ListRow, ListSection, useThemeColors } from '@chefer/ui-mobile';
import { PREMIUM_PITCH_COPY } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { useIsPremium } from '../../hooks/use-is-premium';
import { openPremium } from './open-premium';

// F6/F7 (owner feedback 2026-10-17, docs/research/premium-entry-points.md):
// the plan, first thing on You. It is status, not a nudge: it never opens on
// its own, so it has no dismiss and sits outside the daily nudge cap. Free
// opens the overview pitch (every benefit, then Turn on Premium); Premium
// only says so and opens what they have — never pitch to someone who has it.
export function TierRow() {
  const isPremium = useIsPremium();
  const colors = useThemeColors();
  // Nothing while loading, so a Premium user never sees "Free" flash.
  if (isPremium === undefined) return null;
  return (
    <ListSection>
      <ListRow
        testID="you-tier"
        title={isPremium ? PREMIUM_PITCH_COPY.tierRowPremium : PREMIUM_PITCH_COPY.tierRowFree}
        subtitle={
          isPremium ? PREMIUM_PITCH_COPY.tierRowPremiumHint : PREMIUM_PITCH_COPY.seeWhatPremiumAdds
        }
        icon={<Icon name="star" color={colors.brand} />}
        onPress={() => (isPremium ? router.push('/profile?section=plan') : openPremium('tier-row'))}
      />
    </ListSection>
  );
}
