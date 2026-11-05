import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { useT } from '../../../lib/i18n';

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
  const { t } = useT();
  return (
    <View testID={testID} className={cn('gap-1 rounded-card bg-brand-tint px-4 py-3', className)}>
      <Text className="text-subhead font-semibold text-label">
        {t('household.sharing.partnerBanner', { ownerName })}
      </Text>
      {ownerOnly ? (
        <Text testID={`${testID}-owner-only`} className="text-subhead text-label-secondary">
          {t('household.sharing.ownerOnly', { ownerName })}
        </Text>
      ) : null}
    </View>
  );
}
