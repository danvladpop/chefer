import { View } from 'react-native';
import { HOUSEHOLD_SHARING_COPY } from '@chefer/types';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

/**
 * "You're sharing Dan's week and shopping list." — a partner's reminder on Household, Meals and Shop.
 * `ownerOnly` adds why the planning actions are missing (Meals: generate, plan a day, settings…).
 */
export function PartnerBanner({
  ownerName,
  ownerOnly = false,
  testID,
  className,
}: {
  ownerName: string;
  ownerOnly?: boolean;
  testID: string;
  className?: string;
}) {
  return (
    <View testID={testID} className={cn('gap-1 rounded-card bg-brand-tint px-4 py-3', className)}>
      <Text className="text-subhead font-semibold text-label">
        {HOUSEHOLD_SHARING_COPY.partnerBanner(ownerName)}
      </Text>
      {ownerOnly ? (
        <Text testID={`${testID}-owner-only`} className="text-subhead text-label-secondary">
          {HOUSEHOLD_SHARING_COPY.ownerOnly(ownerName)}
        </Text>
      ) : null}
    </View>
  );
}
