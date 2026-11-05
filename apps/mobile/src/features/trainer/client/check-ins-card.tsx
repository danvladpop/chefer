import { useState } from 'react';
import { View } from 'react-native';
import { CHECK_IN_COPY } from '@chefer/types';
import { Button, Text } from '@chefer/ui-mobile';
import { checkInAnswersLine, formatDayWithWeekday } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { CoachingCard } from '../components/coaching-card';

// ─── Client › Check-ins (lane K3) ─────────────────────────────────────────────
// The client's answers to the trainer's weekly check-in, newest first (3, then Show more), with this
// week's state ("waiting for Maria"). Only for an ACTIVE coaching: the API answers NOT_FOUND otherwise.
// Mirrors web CheckInsCard.tsx.

export function CheckInsCard({ clientId, firstName }: { clientId: string; firstName: string }) {
  const copy = CHECK_IN_COPY.trainer;
  const [all, setAll] = useState(false);
  const checkIns = trpc.trainer.client.checkIns.useQuery({ clientId, today: localDate() });
  // A failed read (an older API, a client who just left) hides the card: the page says the rest.
  if (checkIns.isPending || checkIns.isError) return null;
  const { enabled, current, items } = checkIns.data;
  if (!enabled && items.length === 0) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <CoachingCard testID="trainer-check-ins" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {copy.cardTitle}
      </Text>
      {current && !current.answered ? (
        <Text testID="trainer-check-ins-waiting" className="text-subhead text-label-secondary">
          {copy.waiting(firstName)}
        </Text>
      ) : null}
      {items.length === 0 ? (
        <Text className="text-subhead text-label-secondary">{copy.none(firstName)}</Text>
      ) : null}
      {shown.map((item) => (
        <View
          key={item.periodStart}
          testID={`trainer-check-in-${item.periodStart}`}
          className="gap-0.5 border-t border-separator pt-3"
        >
          <Text className="text-subhead font-semibold text-label">
            {copy.week(formatDayWithWeekday(item.periodStart))}
          </Text>
          <Text className="text-footnote text-label">
            {checkInAnswersLine(item.questions, item.answers)}
          </Text>
          {item.note ? (
            <Text className="text-footnote text-label-secondary">“{item.note}”</Text>
          ) : null}
        </View>
      ))}
      {!all && items.length > 3 ? (
        <Button testID="trainer-check-ins-more" variant="outline" onPress={() => setAll(true)}>
          {copy.showMore}
        </Button>
      ) : null}
    </CoachingCard>
  );
}
