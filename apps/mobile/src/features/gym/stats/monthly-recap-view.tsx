import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { GymBootstrap } from '@chefer/types';
import { EmptyState, ErrorState, IconButton, Text, useThemeColors } from '@chefer/ui-mobile';
import { formatLoad, VOLUME_GROUP_LABELS } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { trpc } from '../../../lib/trpc';
import { TrainCard } from '../../shell/train/train-cards';
import { useIsOnline } from '../library-screens/online-status';
import { localDate } from '../offline/ids';
import { LogWeightPrompt } from './log-weight-prompt';

// (e) Monthly recap (gym_plan.md §1.3 Stats #5): sessions vs goal, weeks met,
// PR count, the 3 biggest e1RM gains, sets per group vs last month, and the
// bodyweight trend. Server-aggregated (needs a connection).

function currentMonth(): string {
  return localDate().slice(0, 7);
}

/** "September 2026" from "2026-09" (never the raw YYYY-MM). */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** One "label … value" line of the recap. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-h-7 flex-row items-center justify-between gap-3">
      <Text className="min-w-0 flex-1 text-callout text-label-secondary">{label}</Text>
      <Text
        className="text-callout font-semibold text-label"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-1 border-t border-separator pt-3">
      <Text accessibilityRole="header" className="text-subhead font-semibold text-label-secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function MonthlyRecapView({
  bootstrap,
  initialMonth,
}: {
  bootstrap: GymBootstrap;
  /** UX-GYM-13: a month deep-linked from Today's recap card (YYYY-MM). */
  initialMonth?: string | undefined;
}) {
  const colors = useThemeColors();
  const online = useIsOnline();
  const [month, setMonth] = useState(initialMonth ?? currentMonth);
  useEffect(() => {
    if (initialMonth) setMonth(initialMonth);
  }, [initialMonth]);
  const recap = trpc.gym.stats.monthlyRecap.useQuery({ month }, { enabled: online });
  const byId = useMemo(() => new Map(bootstrap.library.map((e) => [e.id, e])), [bootstrap.library]);
  const unit = bootstrap.profile?.unit ?? 'KG';

  return (
    <TrainCard testID="stats-monthly-recap">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-headline font-semibold text-label"
        >
          Monthly recap
        </Text>
        <View className="-mr-2 flex-row items-center">
          <IconButton
            testID="stats-recap-prev"
            accessibilityLabel="Previous month"
            icon={<Icon name="chevronBack" color={colors.brand} size={20} />}
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
          />
          <Text testID="stats-recap-month" className="text-subhead font-semibold text-label">
            {monthLabel(month)}
          </Text>
          <IconButton
            testID="stats-recap-next"
            accessibilityLabel="Next month"
            disabled={month >= currentMonth()}
            icon={<Icon name="chevronRight" color={colors.brand} size={20} />}
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
          />
        </View>
      </View>

      {!online && !recap.data ? (
        <EmptyState
          testID="stats-monthly-recap-offline"
          title="Connect to see this month's recap"
          description="The recap is put together from your full history on the server."
        />
      ) : recap.isLoading ? (
        <Text className="text-subhead text-label-secondary">Loading…</Text>
      ) : recap.isError && !recap.data ? (
        // UX-GYM-34: a failed load is an error with Retry, not "No data for this month".
        <ErrorState
          testID="stats-monthly-recap-error"
          title="Couldn’t load this month’s recap"
          onRetry={() => void recap.refetch()}
        />
      ) : !recap.data ? (
        <EmptyState testID="stats-monthly-recap-empty" title="No data for this month yet" />
      ) : (
        <View className="gap-3">
          <View>
            <Fact
              label="Sessions"
              value={`${recap.data.sessions} / ${recap.data.sessionsGoal} goal`}
            />
            <Fact label="Weeks met" value={`${recap.data.weeksMet} / ${recap.data.weeksTotal}`} />
            <Fact label="Streak" value={String(recap.data.streak)} />
            <Fact label="PRs this month" value={String(recap.data.prCount)} />
          </View>

          {recap.data.topGains.length > 0 ? (
            <Group title="Biggest gains">
              {recap.data.topGains.slice(0, 3).map((gain, i) => (
                <View key={i} className="gap-0.5 py-1">
                  <Text className="text-callout text-label" numberOfLines={2}>
                    {byId.get(gain.exerciseId)?.name ?? gain.exerciseId}
                  </Text>
                  <Text className="text-subhead text-label-secondary">
                    {formatLoad(gain.fromKg, unit)} → {formatLoad(gain.toKg, unit)}{' '}
                    <Text className="text-subhead font-semibold text-positive">
                      (+{gain.pct.toFixed(0)}%)
                    </Text>
                  </Text>
                </View>
              ))}
            </Group>
          ) : null}

          {recap.data.setsByGroup.length > 0 ? (
            <Group title="Sets per muscle vs last month">
              {recap.data.setsByGroup.map((row, i) => (
                <Fact
                  key={i}
                  label={
                    (VOLUME_GROUP_LABELS as Record<string, string | undefined>)[row.group] ??
                    row.group
                  }
                  value={`${row.sets} (was ${row.prevSets})`}
                />
              ))}
            </Group>
          ) : null}

          <Group title="Bodyweight">
            {recap.data.bodyweight.startKg !== null && recap.data.bodyweight.endKg !== null ? (
              <Text className="text-callout text-label">
                {formatLoad(recap.data.bodyweight.startKg, unit)} →{' '}
                {formatLoad(recap.data.bodyweight.endKg, unit)}
              </Text>
            ) : (
              <LogWeightPrompt testID="stats-recap-log-weight" />
            )}
          </Group>
        </View>
      )}
    </TrainCard>
  );
}
