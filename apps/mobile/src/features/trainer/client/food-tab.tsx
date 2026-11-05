import { ActivityIndicator, View } from 'react-native';
import type { ClientFoodDayDto, ClientSharingDto } from '@chefer/types';
import { ErrorState, Text } from '@chefer/ui-mobile';
import { formatBodyWeight } from '@chefer/utils';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { WeightSparkline } from '../../coach/weight-sparkline';
import { formatDayWithWeekdayT, formatShortDayT } from '../../coaching/copy';
import { localDate } from '../../gym/offline/ids';
import { CoachingCard } from '../components/coaching-card';
import { foodDayPartsT } from '../data-lines';

// ─── Client › Food (lane K2) ──────────────────────────────────────────────────
// What the client shares: the food log of the last 7 days (meals, kcal and protein against targets
// in the numbers the client chose to see, plan adherence, the entries' names) and the weigh-ins of the
// last 3 months. Each part asks only when its switch is on; a revoke answers the uniform NOT_FOUND,
// which reads as "doesn't share" here. Raw weight; the trend line waits for lane D1.

function DayRow({ day }: { day: ClientFoodDayDto }) {
  const tr = useT();
  const { t } = tr;
  return (
    <View testID={`trainer-food-day-${day.date}`} className="gap-1 border-t border-separator pt-3">
      <Text className="text-subhead font-semibold text-label">
        {formatDayWithWeekdayT(day.date, t)}
      </Text>
      <Text className="text-footnote text-label-secondary">
        {foodDayPartsT(day, tr).join(' · ')}
      </Text>
      {day.entries.map((entry, i) => (
        <Text key={`${entry.name}-${i}`} className="text-footnote text-label">
          {entry.name}
          {entry.onPlan ? ` · ${t('coaching.trainer.data.food.onPlan')}` : ''}
        </Text>
      ))}
    </View>
  );
}

function FoodSection({ clientId, firstName }: { clientId: string; firstName: string }) {
  const { t } = useT();
  const food = trpc.trainer.client.food.useQuery({ clientId, today: localDate(), days: 7 });
  if (food.isPending) return <ActivityIndicator testID="trainer-food-loading" />;
  if (food.isError) {
    return <ErrorState testID="trainer-food-error" onRetry={() => void food.refetch()} />;
  }
  return (
    <CoachingCard testID="trainer-food" className="gap-3">
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-headline font-semibold text-label">
          {t('coaching.trainer.data.food.heading')}
        </Text>
        <Text className="text-footnote text-label-secondary">
          {t('coaching.trainer.data.food.sharedSince', {
            date: formatShortDayT(food.data.sharedSince, t),
          })}
        </Text>
        {food.data.numbers === 'NONE' ? (
          <Text className="text-footnote text-label-secondary">
            {t('coaching.trainer.data.week.numbersHidden', { client: firstName })}
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
  const { t } = useT();
  const weight = trpc.trainer.client.weight.useQuery({ clientId, today: localDate() });
  if (weight.isPending) return <ActivityIndicator testID="trainer-weight-loading" />;
  if (weight.isError) {
    return <ErrorState testID="trainer-weight-error" onRetry={() => void weight.refetch()} />;
  }
  const entries = weight.data.entries;
  return (
    <CoachingCard testID="trainer-weight" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {t('coaching.trainer.data.weight.heading')}
      </Text>
      {entries.length === 0 ? (
        <Text className="text-subhead text-label-secondary">
          {t('coaching.trainer.data.weight.empty')}
        </Text>
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
                {formatDayWithWeekdayT(e.date, t)} · {formatBodyWeight(e.weightKg, 'METRIC')}
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
  const { t } = useT();
  return (
    <View testID="trainer-food-tab" className="gap-4">
      {sharing.food ? (
        <FoodSection clientId={clientId} firstName={firstName} />
      ) : (
        <Text className="text-subhead text-label-secondary">
          {t('coaching.trainer.data.food.notShared', { client: firstName })}
        </Text>
      )}
      {sharing.weight ? (
        <WeightSection clientId={clientId} />
      ) : (
        <Text className="text-subhead text-label-secondary">
          {t('coaching.trainer.data.weight.notShared', { client: firstName })}
        </Text>
      )}
    </View>
  );
}
