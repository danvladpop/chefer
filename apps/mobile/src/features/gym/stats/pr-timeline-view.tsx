import { useMemo, useState } from 'react';
import { View } from 'react-native';
import type { GymBootstrap, PersonalRecord } from '@chefer/types';
import { EmptyState, SelectField, Text } from '@chefer/ui-mobile';
import { cn, collectPrs, formatLoad, formatLocalDateLong } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { TrainCard } from '../../shell/train/train-cards';
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
    <TrainCard testID="stats-pr-timeline">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        PR timeline
      </Text>
      {/* FB7-09: a searchable dropdown (as on web), not one chip per exercise. */}
      <SelectField
        testID="stats-pr-filter"
        label="Exercise"
        options={filterOptions}
        value={exerciseId ?? ALL}
        onChange={(v) => setExerciseId(v === ALL ? null : v)}
      />
      {prs.length === 0 ? (
        <EmptyState
          testID="stats-pr-timeline-empty"
          title="No PRs yet"
          description="Your first personal record will show up here."
        />
      ) : (
        <View>
          {prs.map((pr, i) => (
            <View
              key={`${pr.sessionId}-${pr.kind}-${i}`}
              testID={`stats-pr-row-${i}`}
              className={cn(
                'min-h-11 flex-row items-center justify-between gap-3 py-2.5',
                i > 0 && 'border-t border-separator',
              )}
            >
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className="text-callout font-semibold text-label">
                  {byId.get(pr.exerciseId)?.name ?? pr.exerciseId}
                </Text>
                <Text className="text-caption text-label-secondary">
                  {formatLocalDateLong(pr.localDate)}
                </Text>
              </View>
              <View className="items-end gap-1">
                <Text
                  className="text-callout font-semibold text-label"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
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
                <View
                  testID={`stats-pr-row-${i}-badge`}
                  className={cn(
                    'rounded-full px-2 py-0.5',
                    pr.isFirst ? 'bg-surface-sunken' : 'bg-brand-tint',
                  )}
                >
                  <Text
                    className={cn(
                      'text-caption font-semibold',
                      pr.isFirst ? 'text-label-secondary' : 'text-brand',
                    )}
                  >
                    {pr.isFirst ? 'First logged' : KIND_LABEL[pr.kind]}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </TrainCard>
  );
}
