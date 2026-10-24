import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { AchievementGroup, AchievementItem } from '@chefer/types';
import { ACHIEVEMENT_GROUPS } from '@chefer/types';
import {
  EmptyState,
  ErrorState,
  KeyboardAwareScrollView,
  PressableScale,
  ProgressBar,
  Screen,
  Sheet,
  Skeleton,
  Text,
  useQueryState,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  ACHIEVEMENT_GROUP_COPY,
  badgesOfTotal,
  cn,
  PROGRESS_COPY,
  tierNumeral,
} from '@chefer/utils';
import { trpc } from '../../lib/trpc';
import { ShellTopBar } from '../shell/shell-chrome';
import { AchievementTile } from './achievement-tile';
import { useProgressEnabled } from './use-progress';

// Achievements (mockup 06), pushed from You → "Your progress": the earned /
// total pill, group filter chips, a "Closest next" card and a grid per group.
// Tapping a tile opens its detail: what the next tier asks and how far along
// you are. Opening the shelf tells the API it was seen (clears the "new" dots
// for next time; this visit still shows them). A tier-0 badge is grey with a
// "?" — never a red lock.

type Filter = 'ALL' | AchievementGroup;

function FilterChip({
  label,
  icon,
  selected,
  onPress,
  testID,
}: {
  label: string;
  icon?: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'min-h-11 flex-row items-center gap-1.5 rounded-full border px-4',
        selected ? 'border-brand bg-brand' : 'border-separator bg-surface',
      )}
    >
      {icon ? <Text accessibilityElementsHidden>{icon}</Text> : null}
      <Text className={cn('text-callout font-semibold', selected ? 'text-brand-on' : 'text-label')}>
        {label}
      </Text>
    </PressableScale>
  );
}

function ClosestNext({ item, onPress }: { item: AchievementItem; onPress: () => void }) {
  const colors = useThemeColors();
  const target = item.nextTarget ?? item.progress;
  const left = Math.max(0, target - item.progress);
  return (
    <PressableScale
      testID="achievements-closest"
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={`${PROGRESS_COPY.closestNext}: ${item.title}. ${item.description}. ${left} ${PROGRESS_COPY.toGo}`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-card border border-separator bg-brand-tint p-4"
    >
      <View className="h-16 w-16 items-center justify-center rounded-card border border-brand bg-surface">
        <Text accessibilityElementsHidden className="text-title1">
          {item.icon}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="min-w-0 shrink text-headline font-bold text-label">
            {PROGRESS_COPY.closestNext}
          </Text>
          <Text className="text-subhead text-label-secondary">
            {left} {PROGRESS_COPY.toGo}
          </Text>
        </View>
        <Text className="text-subhead text-label-secondary">
          {item.title} — {item.description}
        </Text>
        <ProgressBar
          progress={target > 0 ? item.progress / target : 0}
          color={colors.brand}
          className="h-2 bg-surface"
        />
      </View>
    </PressableScale>
  );
}

function DetailSheet({ item, onClose }: { item: AchievementItem | null; onClose: () => void }) {
  const colors = useThemeColors();
  // Keep the last item while the sheet slides away.
  const last = useRef<AchievementItem | null>(null);
  if (item) last.current = item;
  const shown = item ?? last.current;
  return (
    <Sheet
      testID="achievement-detail"
      visible={item !== null}
      onClose={onClose}
      title={shown?.title ?? ''}
    >
      {shown ? (
        <View className="items-center gap-3 pb-2">
          <View
            className={cn(
              'h-20 w-20 items-center justify-center rounded-card',
              shown.tier > 0 ? 'border border-brand bg-brand-tint' : 'bg-surface-sunken',
            )}
          >
            <Text accessibilityElementsHidden className="text-display">
              {shown.tier > 0 ? shown.icon : '?'}
            </Text>
          </View>
          <Text testID="achievement-detail-tier" className="text-callout text-label-secondary">
            {shown.tier > 0
              ? `${PROGRESS_COPY.achievementTierLabel} ${tierNumeral(shown.tier)}`
              : PROGRESS_COPY.achievementsLocked}
          </Text>
          <Text className="text-center text-body text-label">
            {shown.nextTarget === null ? PROGRESS_COPY.achievementsAllEarned : shown.description}
          </Text>
          {shown.nextTarget !== null ? (
            <View className="w-full gap-1">
              <ProgressBar
                testID="achievement-detail-bar"
                progress={shown.nextTarget > 0 ? shown.progress / shown.nextTarget : 0}
                color={colors.brand}
                className="h-2 bg-surface-sunken"
              />
              <Text
                testID="achievement-detail-progress"
                className="text-right text-subhead text-label-secondary"
              >
                {shown.progress} / {shown.nextTarget}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

export function AchievementsScreen() {
  const enabled = useProgressEnabled();
  const query = trpc.progress.achievements.useQuery(undefined, { enabled });
  const { state, data, retry } = useQueryState(query);
  const markSeen = trpc.progress.markSeen.useMutation();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [open, setOpen] = useState<AchievementItem | null>(null);

  // Opening the shelf marks it seen, once.
  const marked = useRef(false);
  useEffect(() => {
    if (!enabled || marked.current) return;
    marked.current = true;
    markSeen.mutate({ achievements: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [enabled]);

  const groups = (data?.groups ?? []).filter((g) => filter === 'ALL' || g.group === filter);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-canvas px-0">
      <ShellTopBar className="mx-4 mt-3" />
      {!enabled ? (
        <EmptyState testID="achievements-unavailable" title={PROGRESS_COPY.unavailable} />
      ) : state === 'loading' ? (
        <View testID="achievements-loading" className="gap-3 px-4 pt-4">
          <Skeleton className="h-11 w-full rounded-full" />
          <Skeleton className="h-24 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </View>
      ) : state === 'error' || !data ? (
        <ErrorState
          testID="achievements-error"
          title={PROGRESS_COPY.achievementsLoadError}
          onRetry={retry}
        />
      ) : (
        <KeyboardAwareScrollView
          testID="achievements-scroll"
          contentContainerClassName="gap-4 px-4 pb-8 pt-3"
        >
          <View className="flex-row justify-end">
            <View className="rounded-full bg-brand-tint px-3 py-1.5">
              <Text
                testID="achievements-count"
                accessibilityLabel={`${PROGRESS_COPY.achievementsTitle}: ${badgesOfTotal(data.earned, data.total)}`}
                className="text-callout font-bold text-brand"
              >
                {data.earned} / {data.total}
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="tablist"
            contentContainerClassName="gap-2"
            className="-mx-4 grow-0"
            contentContainerStyle={{ paddingHorizontal: 16 }}
          >
            <FilterChip
              testID="achievements-filter-all"
              label={PROGRESS_COPY.achievementsAll}
              selected={filter === 'ALL'}
              onPress={() => setFilter('ALL')}
            />
            {ACHIEVEMENT_GROUPS.map((g) => (
              <FilterChip
                key={g}
                testID={`achievements-filter-${g}`}
                label={ACHIEVEMENT_GROUP_COPY[g].title}
                icon={ACHIEVEMENT_GROUP_COPY[g].icon}
                selected={filter === g}
                onPress={() => setFilter(g)}
              />
            ))}
          </ScrollView>

          {data.closestNext && filter === 'ALL' ? (
            <ClosestNext item={data.closestNext} onPress={() => setOpen(data.closestNext)} />
          ) : null}

          {groups.map(({ group, items }) => (
            <View key={group} testID={`achievements-group-${group}`} className="gap-1">
              <Text accessibilityRole="header" className="text-title3 font-bold text-label">
                {ACHIEVEMENT_GROUP_COPY[group].icon} {ACHIEVEMENT_GROUP_COPY[group].title}
              </Text>
              <View className="-mx-1 flex-row flex-wrap">
                {items.map((item) => (
                  <AchievementTile key={item.id} item={item} onPress={setOpen} />
                ))}
              </View>
            </View>
          ))}
        </KeyboardAwareScrollView>
      )}
      <DetailSheet item={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}
