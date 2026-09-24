import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { GymBootstrap, PersonalRecord } from '@chefer/types';
import { Badge, Card, CardTitle, Chip, EmptyState, Text } from '@chefer/ui-mobile';
import { collectPrs, formatLoad } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';

// (d) PR timeline (gym_plan.md §1.3 Stats #4): every PR, newest first,
// filterable by exercise.

const KIND_LABEL: Record<PersonalRecord['kind'], string> = {
  weight: 'Weight PR',
  reps: 'Rep PR',
  e1rm: 'e1RM PR',
};

export function PrTimelineView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const online = useIsOnline();
  const [exerciseId, setExerciseId] = useState<string | null>(null);

  const apiPrs = trpc.gym.stats.prs.useQuery(
    { exerciseId: exerciseId ?? undefined, limit: 50 },
    { enabled: online },
  );

  const localPrs = useMemo(
    () => collectPrs(bootstrap.recentSessions, exerciseId ?? undefined),
    [bootstrap.recentSessions, exerciseId],
  );

  const prs: PersonalRecord[] = (apiPrs.data ?? localPrs)
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));

  const byId = useMemo(() => new Map(bootstrap.library.map((e) => [e.id, e])), [bootstrap.library]);
  const exerciseOptions = useMemo(
    () => [
      ...new Set(bootstrap.recentSessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))),
    ],
    [bootstrap.recentSessions],
  );

  return (
    <Card testID="stats-pr-timeline">
      <CardTitle>PR timeline</CardTitle>
      <View className="mb-3 flex-row flex-wrap gap-2">
        <Chip
          testID="stats-pr-filter-all"
          label="All"
          selected={exerciseId === null}
          onPress={() => setExerciseId(null)}
        />
        {exerciseOptions.map((id) => (
          <Chip
            key={id}
            testID={`stats-pr-filter-${id}`}
            label={byId.get(id)?.name ?? id}
            selected={exerciseId === id}
            onPress={() => setExerciseId(id)}
          />
        ))}
      </View>
      {prs.length === 0 ? (
        <EmptyState
          testID="stats-pr-timeline-empty"
          title="No PRs yet"
          description="Your first personal record will show up here."
        />
      ) : (
        prs.map((pr, i) => (
          <View
            key={`${pr.sessionId}-${pr.kind}-${i}`}
            testID={`stats-pr-row-${i}`}
            className="flex-row items-center justify-between border-b border-border py-2"
          >
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1}>{byId.get(pr.exerciseId)?.name ?? pr.exerciseId}</Text>
              <Text variant="muted">{pr.localDate}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text>
                {formatLoad(pr.weightKg, bootstrap.profile?.unit ?? 'KG')} × {pr.reps}
              </Text>
              <Badge variant="warning">{KIND_LABEL[pr.kind]}</Badge>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}
