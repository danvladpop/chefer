import { router } from 'expo-router';
import { ListRow, ListSection, useThemeColors } from '@chefer/ui-mobile';
import { PREMIUM_PITCH_COPY } from '@chefer/utils';
import { Icon } from '../../components/icon';
import { useTier } from '../../hooks/use-tier';
import { openPremium } from './open-premium';

// F6/F7 (owner feedback 2026-10-17, docs/research/premium-entry-points.md):
// the plan, first thing on You. It is status, not a nudge: it never opens on
// its own, so it has no dismiss and sits outside the daily nudge cap. Free
// opens the overview pitch (every benefit, then Turn on Premium); Premium
// only says so and opens what they have — never pitch to someone who has it.
// An admin has every feature without a plan, so their row is status only.
export function TierRow() {
  const tier = useTier();
  const colors = useThemeColors();
  // Nothing while loading, so a Premium user never sees "Free" flash.
  if (tier === undefined) return null;
  return (
    <ListSection>
      <ListRow
        testID="you-tier"
        title={tier === 'free' ? PREMIUM_PITCH_COPY.tierRowFree : PREMIUM_PITCH_COPY.tierRowPremium}
        subtitle={
          tier === 'free'
            ? PREMIUM_PITCH_COPY.seeWhatPremiumAdds
            : tier === 'premium'
              ? PREMIUM_PITCH_COPY.tierRowPremiumHint
              : PREMIUM_PITCH_COPY.tierRowAdminHint
        }
        icon={<Icon name="star" color={colors.brand} />}
        // An admin has no plan to see or switch off (Profile hides that card for them): status only.
        {...(tier === 'free'
          ? { onPress: () => openPremium('tier-row') }
          : tier === 'premium'
            ? { onPress: () => router.push('/profile?section=plan') }
            : {})}
      />
    </ListSection>
  );
}
