import { View } from 'react-native';
import { COACHING_DATA_COPY } from '@chefer/types';
import { ErrorState, Skeleton, Text } from '@chefer/ui-mobile';
import { formatBodyWeight, formatDayWithWeekday, weekSummaryLines } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { CoachingCard } from '../components/coaching-card';

// ─── Client › "Last 7 days" (lane K2) ─────────────────────────────────────────
// The weekly card on top of a client: workouts against the goal always; the food log and weight only
// while the client shares them (the API sends neither otherwise). The words come from
// `weekSummaryLines` (@chefer/utils), the same lines the web card renders. Weights in kg, like every
// trainer screen on mobile (the trainer's unit is not part of what a client shares).

const kg = (value: number, signed?: boolean) =>
  formatBodyWeight(value, 'METRIC', signed ? { signed: true } : {});

function Section({ title, lines, testID }: { title: string; lines: string[]; testID: string }) {
  return (
    <View testID={testID} className="gap-0.5">
      <Text className="text-footnote font-semibold uppercase text-label-secondary">{title}</Text>
      {lines.map((line) => (
        <Text key={line} className="text-subhead text-label">
          {line}
        </Text>
      ))}
    </View>
  );
}

export function WeekSummaryCard({ clientId, firstName }: { clientId: string; firstName: string }) {
  const week = trpc.trainer.client.weekSummary.useQuery({ clientId, today: localDate() });
  if (week.isPending) {
    return <Skeleton testID="trainer-week-loading" className="h-28 rounded-card" />;
  }
  if (week.isError) {
    return <ErrorState testID="trainer-week-error" onRetry={() => void week.refetch()} />;
  }
  const lines = weekSummaryLines(week.data, firstName, {
    weightKg: kg,
    date: formatDayWithWeekday,
  });
  return (
    <CoachingCard testID="trainer-week" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {COACHING_DATA_COPY.week.title}
      </Text>
      <Text testID="trainer-week-workouts" className="text-subhead text-label">
        {lines.workouts}
      </Text>
      {lines.food ? (
        <Section
          testID="trainer-week-food"
          title={COACHING_DATA_COPY.food.heading}
          lines={lines.food}
        />
      ) : null}
      {lines.weight ? (
        <Section
          testID="trainer-week-weight"
          title={COACHING_DATA_COPY.weight.heading}
          lines={lines.weight}
        />
      ) : null}
      {lines.notShared ? (
        <View testID="trainer-week-not-shared" className="gap-0.5">
          <Text className="text-subhead text-label-secondary">{lines.notShared.title}</Text>
          <Text className="text-footnote text-label-secondary">{lines.notShared.hint}</Text>
        </View>
      ) : null}
    </CoachingCard>
  );
}
