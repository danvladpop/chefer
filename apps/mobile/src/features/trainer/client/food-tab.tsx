import { ActivityIndicator, View } from 'react-native';
import { COACHING_DATA_COPY, type ClientFoodDayDto, type ClientSharingDto } from '@chefer/types';
import { ErrorState, Text } from '@chefer/ui-mobile';
import {
  foodDayParts,
  formatBodyWeight,
  formatDayWithWeekday,
  formatShortDay,
} from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { WeightSparkline } from '../../coach/weight-sparkline';
import { localDate } from '../../gym/offline/ids';
import { CoachingCard } from '../components/coaching-card';

// ─── Client › Food (lane K2) ──────────────────────────────────────────────────
// What the client shares: the food log of the last 7 days (meals, kcal and protein against targets
// in the numbers the client chose to see, plan adherence, the entries' names) and the weigh-ins of the
// last 3 months. Each part asks only when its switch is on; a revoke answers the uniform NOT_FOUND,
// which reads as "doesn't share" here. Raw weight; the trend line waits for lane D1.

function DayRow({ day }: { day: ClientFoodDayDto }) {
  return (
    <View testID={`trainer-food-day-${day.date}`} className="gap-1 border-t border-separator pt-3">
      <Text className="text-subhead font-semibold text-label">
        {formatDayWithWeekday(day.date)}
      </Text>
      <Text className="text-footnote text-label-secondary">{foodDayParts(day).join(' · ')}</Text>
      {day.entries.map((entry, i) => (
        <Text key={`${entry.name}-${i}`} className="text-footnote text-label">
          {entry.name}
          {entry.onPlan ? ` · ${COACHING_DATA_COPY.food.onPlan}` : ''}
        </Text>
      ))}
    </View>
  );
}

function FoodSection({ clientId, firstName }: { clientId: string; firstName: string }) {
  const food = trpc.trainer.client.food.useQuery({ clientId, today: localDate(), days: 7 });
  if (food.isPending) return <ActivityIndicator testID="trainer-food-loading" />;
  if (food.isError) {
    return <ErrorState testID="trainer-food-error" onRetry={() => void food.refetch()} />;
  }
  return (
    <CoachingCard testID="trainer-food" className="gap-3">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {COACHING_DATA_COPY.food.heading}
        </Text>
        <Text className="text-footnote text-label-secondary">
          {COACHING_DATA_COPY.food.sharedSince(formatShortDay(food.data.sharedSince))}
        </Text>
        {food.data.numbers === 'NONE' ? (
          <Text className="text-footnote text-label-secondary">
            {COACHING_DATA_COPY.week.numbersHidden(firstName)}
          </Text>
        ) : null}
      </View>
      {[...food.data.days].reverse().map((day) => (
        <DayRow key={day.date} day={day} />
      ))}
    </CoachingCard>
  );
}

function WeightSection({ clientId }: { clientId: string }) {
  const weight = trpc.trainer.client.weight.useQuery({ clientId, today: localDate() });
  if (weight.isPending) return <ActivityIndicator testID="trainer-weight-loading" />;
  if (weight.isError) {
    return <ErrorState testID="trainer-weight-error" onRetry={() => void weight.refetch()} />;
  }
  const entries = weight.data.entries;
  return (
    <CoachingCard testID="trainer-weight" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {COACHING_DATA_COPY.weight.heading}
      </Text>
      {entries.length === 0 ? (
        <Text className="text-subhead text-label-secondary">{COACHING_DATA_COPY.weight.empty}</Text>
      ) : (
        <>
          <WeightSparkline
            entries={entries.map((e) => ({
              weightKg: e.weightKg,
              recordedAt: `${e.date}T12:00:00`,
            }))}
            system="METRIC"
            windowDays={90}
          />
          {[...entries]
            .reverse()
            .slice(0, 5)
            .map((e) => (
              <Text key={e.date} className="text-footnote text-label">
                {formatDayWithWeekday(e.date)} · {formatBodyWeight(e.weightKg, 'METRIC')}
              </Text>
            ))}
        </>
      )}
    </CoachingCard>
  );
}

export function FoodTab({
  clientId,
  firstName,
  sharing,
}: {
  clientId: string;
  firstName: string;
  sharing: ClientSharingDto;
}) {
  return (
    <View testID="trainer-food-tab" className="gap-4">
      {sharing.food ? (
        <FoodSection clientId={clientId} firstName={firstName} />
      ) : (
        <Text className="text-subhead text-label-secondary">
          {COACHING_DATA_COPY.food.notShared(firstName)}
        </Text>
      )}
      {sharing.weight ? (
        <WeightSection clientId={clientId} />
      ) : (
        <Text className="text-subhead text-label-secondary">
          {COACHING_DATA_COPY.weight.notShared(firstName)}
        </Text>
      )}
    </View>
  );
}
