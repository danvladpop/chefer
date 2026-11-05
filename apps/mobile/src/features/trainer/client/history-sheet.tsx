import { ActivityIndicator, View } from 'react-native';
import { ErrorState, Sheet, Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { formatCoachedSet, formatWeekdayDate, rirText } from '../format';

// One exercise's recent history (last 8 exposures), opened by tapping an exercise in Workouts.

export function ExerciseHistorySheet({
  clientId,
  exercise,
  onClose,
}: {
  clientId: string;
  exercise: { exerciseId: string; name: string } | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const query = trpc.trainer.client.exerciseHistory.useQuery(
    { clientId, exerciseId: exercise?.exerciseId ?? '' },
    { enabled: exercise !== null },
  );
  return (
    <Sheet
      visible={exercise !== null}
      onClose={onClose}
      title={exercise?.name ?? ''}
      testID="trainer-history"
    >
      {query.isPending ? (
        <ActivityIndicator testID="trainer-history-loading" />
      ) : query.isError ? (
        <ErrorState testID="trainer-history-error" onRetry={() => void query.refetch()} />
      ) : query.data.entries.length === 0 ? (
        <Text className="text-subhead text-label-secondary">
          {t('coaching.trainer.workouts.noHistory')}
        </Text>
      ) : (
        <View className="gap-3">
          {query.data.entries.map((entry) => {
            const effort = rirText(entry.lastSetRir, t);
            return (
              <View
                key={entry.localDate}
                testID={`trainer-history-${entry.localDate}`}
                className="gap-0.5"
              >
                <Text className="font-medium">{formatWeekdayDate(entry.localDate, t)}</Text>
                <Text className="text-sm">
                  {entry.sets.map((set) => formatCoachedSet(set, t)).join('  ·  ')}
                </Text>
                {effort ? (
                  <Text className="text-caption text-label-secondary">{effort}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Sheet>
  );
}
