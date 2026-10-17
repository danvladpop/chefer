import { View } from 'react-native';
import { COACHING_COPY, type FriendUserSummary } from '@chefer/types';
import { Badge, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// The "Trainer" badge and the optional "Gym / city" line (PRD 2026-10 §4.1) wherever Following shows a
// person who has trainer tools on (`FriendUserSummary.trainer`, additive): rows and the profile header.
// Renders nothing for everyone else.

/** "Trainer, Iron Gym, Cluj" for the row's accessible name, or null. */
export function trainerTagLabel(trainer: FriendUserSummary['trainer']): string | null {
  if (!trainer) return null;
  return [COACHING_COPY.find.badge, trainer.gymLine].filter(Boolean).join(', ');
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
  if (!trainer) return null;
  return (
    <View
      testID={testID}
      className={cn(
        'flex-row flex-wrap items-center gap-x-2 gap-y-1',
        centered && 'justify-center',
      )}
    >
      <Badge variant="secondary">{COACHING_COPY.find.badge}</Badge>
      {trainer.gymLine ? (
        <Text className="text-subhead text-label-secondary" numberOfLines={1}>
          {trainer.gymLine}
        </Text>
      ) : null}
    </View>
  );
}
