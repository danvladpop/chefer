import { View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import type { FriendUserSummary } from '@chefer/types';
import { Badge, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';
import { getTranslator, useT } from '../../../lib/i18n';

// The "Trainer" badge and the optional "Gym / city" line (PRD 2026-10 §4.1) wherever Following shows a
// person who has trainer tools on (`FriendUserSummary.trainer`, additive): rows and the profile header.
// Renders nothing for everyone else.

/** "Trainer, Iron Gym, Cluj" for the row's accessible name, or null. */
export function trainerTagLabel(
  trainer: FriendUserSummary['trainer'],
  t: Translator['t'] = getTranslator().t,
): string | null {
  if (!trainer) return null;
  return [t('coaching.find.badge'), trainer.gymLine].filter(Boolean).join(', ');
}

export function TrainerTag({
  trainer,
  centered = false,
  testID,
}: {
  trainer: FriendUserSummary['trainer'];
  centered?: boolean;
  testID: string;
}) {
  const { t } = useT();
  if (!trainer) return null;
  return (
    <View
      testID={testID}
      className={cn(
        'flex-row flex-wrap items-center gap-x-2 gap-y-1',
        centered && 'justify-center',
      )}
    >
      <Badge variant="secondary">{t('coaching.find.badge')}</Badge>
      {trainer.gymLine ? (
        <Text className="text-subhead text-label-secondary" numberOfLines={1}>
          {trainer.gymLine}
        </Text>
      ) : null}
    </View>
  );
}
