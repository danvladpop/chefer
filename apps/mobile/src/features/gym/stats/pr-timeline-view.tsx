import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { GymBootstrap, PersonalRecord } from '@chefer/types';
import { Badge, Card, CardTitle, EmptyState, SelectField, Text } from '@chefer/ui-mobile';
import { collectPrs, formatLoad, formatLocalDateLong } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { useIsOnline } from '../library-screens/online-status';

// (d) PR timeline (gym_plan.md §1.3 Stats #4): every PR, newest first,
// filterable by exercise.

const KIND_LABEL: Record<PersonalRecord['kind'], string> = {
  weight: 'Weight PR',
  reps: 'Rep PR',
  e1rm: 'e1RM PR',
};

// Sentinel for the "All" option — never a real exercise id.
const ALL = '__all__';

export function PrTimelineView({ bootstrap }: { bootstrap: GymBootstrap }) {
  const online = useIsOnline();
  const [exerciseId, setExerciseId] = useState<string | null>(null);

  const apiPrs = trpc.gym.stats.prs.useQuery(
    { exerciseId: exerciseId ?? undefined, limit: 50 },
    { enabled: online },
  );

  const localPrs = useMemo(
    () => collectPrs(bootstrap.recentSessions, exerciseId ?? undefined, bootstrap.olderBests),
    [bootstrap.recentSessions, bootstrap.olderBests, exerciseId],
  );

  const prs: PersonalRecord[] = (apiPrs.data ?? localPrs)
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));

  const byId = useMemo(() => new Map(bootstrap.library.map((e) => [e.id, e])), [bootstrap.library]);
  const filterOptions = useMemo(() => {
    const ids = [
      ...new Set(bootstrap.recentSessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))),
    ];
    return [
      { value: ALL, label: 'All' },
      ...ids
        .map((id) => ({ value: id, label: byId.get(id)?.name ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [bootstrap.recentSessions, byId]);

  return (
    <Card testID="stats-pr-timeline">
      <CardTitle>PR timeline</CardTitle>
      {/* FB7-09: a searchable dropdown (as on web), not one chip per exercise. */}
      <SelectField
        testID="stats-pr-filter"
        label="Exercise"
        options={filterOptions}
        value={exerciseId ?? ALL}
        onChange={(v) => setExerciseId(v === ALL ? null : v)}
        className="mb-3"
      />
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
              <Text variant="muted">{formatLocalDateLong(pr.localDate)}</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text>
                {formatLoad(
                  pr.weightKg,
                  bootstrap.profile?.unit ?? 'KG',
                  byId.get(pr.exerciseId)?.loadType,
                  {
                    each: byId.get(pr.exerciseId)?.perHand,
                  },
                )}{' '}
                × {pr.reps}
              </Text>
              {/* T-05.6 (UX-05 F): the first-ever logged set is its own kind
                  of milestone — a bare "e1RM PR" badge would read oddly for
                  a lift with nothing prior to beat. */}
              <Badge
                testID={`stats-pr-row-${i}-badge`}
                variant={pr.isFirst ? 'secondary' : 'warning'}
              >
                {pr.isFirst ? 'First logged' : KIND_LABEL[pr.kind]}
              </Badge>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}
