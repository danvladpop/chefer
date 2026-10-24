import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { WeeklyRecap } from '@chefer/types';
import {
  Biscuit,
  ErrorState,
  haptics,
  IconButton,
  PopIn,
  PressableScale,
  Screen,
  Text,
  useQueryState,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  biscuitLine,
  cn,
  dishCookedLabel,
  flameWeeksLabel,
  formatDateRange,
  levelLabel,
  PROGRESS_COPY,
} from '@chefer/utils';
import { Icon } from '../../components/icon';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';
import { useProgressEnabled, useProgressSummary } from './use-progress';

// Weekly recap (mockup 10): a story of up to three cards over the brand colour,
// with a segment bar on top, tap right for the next card and left for the
// previous, ✕ to close. Card 1: the week in four tiles (a tile with nothing in
// it is left out: a quiet week is never a row of zeros). Card 2: the dish of
// the week. Card 3: the flame, XP and level, and Biscuit's take. No Share (P2).
// Opening it tells the API (markSeen) so Today's banner goes away. MO-14 pop
// for the headline; reduced motion shows everything in place.

type Card = 'tiles' | 'dish' | 'stats';

function Tile({ value, label, testID }: { value: number; label: string; testID: string }) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${value} ${label}`}
      className="min-h-24 w-[48%] justify-center gap-1 rounded-card bg-brand-on/15 p-4"
    >
      <Text importantForAccessibility="no" className="text-display font-bold text-brand-on">
        {value}
      </Text>
      <Text importantForAccessibility="no" className="text-callout text-brand-on">
        {label}
      </Text>
    </View>
  );
}

type RecapTile = { key: string; value: number; label: string };

function TilesCard({ recap, quiet }: { recap: WeeklyRecap; quiet: boolean }) {
  const goalMet = recap.workoutGoal !== null && recap.workouts >= recap.workoutGoal;
  const candidates: (RecapTile | null)[] = [
    recap.cooked > 0 && !quiet
      ? { key: 'cooked', value: recap.cooked, label: PROGRESS_COPY.recapCooked }
      : null,
    recap.workouts > 0
      ? {
          key: 'workouts',
          value: recap.workouts,
          label: goalMet ? PROGRESS_COPY.recapWorkoutsGoalMet : PROGRESS_COPY.recapWorkouts,
        }
      : null,
    recap.prs > 0 ? { key: 'prs', value: recap.prs, label: PROGRESS_COPY.recapPrs } : null,
    recap.newRecipes > 0 && !quiet
      ? { key: 'recipes', value: recap.newRecipes, label: PROGRESS_COPY.recapNewRecipes }
      : null,
  ];
  const tiles = candidates.filter((t): t is RecapTile => t !== null);
  return (
    <View className="gap-4">
      <PopIn from={0.9}>
        <Text
          accessibilityRole="header"
          testID="recap-headline"
          className="text-title1 font-bold text-brand-on"
        >
          {PROGRESS_COPY.recapHeadline} 🍳
        </Text>
      </PopIn>
      {tiles.length > 0 ? (
        <View className="flex-row flex-wrap justify-between gap-y-3">
          {tiles.map((t) => (
            <Tile key={t.key} testID={`recap-tile-${t.key}`} value={t.value} label={t.label} />
          ))}
        </View>
      ) : (
        <Text testID="recap-empty" className="text-body text-brand-on">
          {PROGRESS_COPY.recapEmpty}
        </Text>
      )}
    </View>
  );
}

function DishCard({ dish }: { dish: NonNullable<WeeklyRecap['dishOfWeek']> }) {
  return (
    <View testID="recap-dish" className="gap-3 rounded-card bg-surface p-4">
      {dish.imageUrl ? (
        <Image
          source={{ uri: dish.imageUrl }}
          accessibilityIgnoresInvertColors
          contentFit="cover"
          className="h-48 w-full rounded-control"
        />
      ) : null}
      <View className="gap-1">
        <Text className="text-subhead font-bold uppercase tracking-widest text-brand">
          {PROGRESS_COPY.recapDish}
        </Text>
        <Text className="text-title2 font-bold text-label">{dish.name}</Text>
        <Text className="text-callout text-label-secondary">
          {dish.rating !== null
            ? `${PROGRESS_COPY.recapRated} ${'★'.repeat(dish.rating)}${'☆'.repeat(Math.max(0, 5 - dish.rating))} — `
            : ''}
          {dishCookedLabel(dish.timesCooked)}
        </Text>
      </View>
    </View>
  );
}

function StatRow({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View testID={testID} className="min-h-9 flex-row items-center justify-between gap-3">
      <Text className="min-w-0 shrink text-callout font-semibold text-brand-on">{label}</Text>
      <Text className="shrink-0 text-callout text-brand-on">{value}</Text>
    </View>
  );
}

function StatsCard({
  recap,
  showXp,
  biscuit,
}: {
  recap: WeeklyRecap;
  showXp: boolean;
  biscuit: boolean;
}) {
  return (
    <View className="gap-4">
      <View testID="recap-stats" className="gap-1 rounded-card bg-brand-on/15 p-4">
        <StatRow
          testID="recap-flame"
          label={`🔥 ${PROGRESS_COPY.recapFlame}`}
          value={
            recap.flame.from === recap.flame.to
              ? flameWeeksLabel(recap.flame.to)
              : `${recap.flame.from} → ${flameWeeksLabel(recap.flame.to)}`
          }
        />
        {showXp ? (
          <StatRow
            testID="recap-xp"
            label={`⭐ ${PROGRESS_COPY.recapXp}`}
            value={`+${recap.xp.toLocaleString('en-US')} · ${levelLabel(recap.level.from)} → ${recap.level.to}`}
          />
        ) : null}
        {biscuit ? (
          <View testID="recap-biscuit" className="flex-row items-center gap-3 pt-1">
            <Biscuit loop="allSet" size={44} label={null} />
            <View className="min-w-0 flex-1">
              <Text className="text-subhead font-semibold text-brand-on">
                {PROGRESS_COPY.recapBiscuit}
              </Text>
              <Text className="text-callout text-brand-on">
                “{biscuitLine('recap', recap.weekStart)}”
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function WeeklyRecapScreen({ week }: { week: string }) {
  const colors = useThemeColors();
  const enabled = useProgressEnabled();
  const { summary } = useProgressSummary();
  const utils = trpc.useUtils();
  const query = trpc.progress.weeklyRecap.useQuery({ weekStart: week }, { enabled });
  const { state, data: recap, retry } = useQueryState(query);
  const markSeen = trpc.progress.markSeen.useMutation({
    onSuccess: () => void utils.progress.summary.invalidate(),
  });
  const [index, setIndex] = useState(0);

  // Opening the recap marks it opened, once.
  const marked = useRef(false);
  useEffect(() => {
    if (!enabled || marked.current) return;
    marked.current = true;
    markSeen.mutate({ recapWeek: week });
    track('kitchen_recap_opened', { source: 'banner' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per visit
  }, [enabled, week]);

  const showXp = summary?.settings.showXp ?? true;
  const quiet = summary?.quiet ?? false;
  const biscuit = (summary?.settings.biscuit ?? true) && !quiet;

  const cards = useMemo<Card[]>(() => {
    if (!recap) return [];
    const list: Card[] = ['tiles'];
    if (recap.dishOfWeek && !quiet) list.push('dish');
    list.push('stats');
    return list;
  }, [recap, quiet]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const step = (delta: 1 | -1) => {
    const next = Math.min(cards.length - 1, Math.max(0, index + delta));
    if (next !== index) {
      haptics.selection();
      setIndex(next);
    }
  };

  const current = cards[Math.min(index, Math.max(0, cards.length - 1))];

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']} className="bg-brand px-0">
      {!enabled ? (
        <View testID="recap-unavailable" className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-center text-body text-brand-on">
            {PROGRESS_COPY.recapUnavailable}
          </Text>
          <IconButton
            testID="recap-close"
            accessibilityLabel={PROGRESS_COPY.recapClose}
            icon={<Icon name="close" size={26} color={colors.onBrand} />}
            onPress={close}
          />
        </View>
      ) : state === 'error' || (state !== 'loading' && !recap) ? (
        <View className="flex-1 bg-canvas">
          <ErrorState testID="recap-error" title={PROGRESS_COPY.recapLoadError} onRetry={retry} />
        </View>
      ) : (
        <View className="flex-1">
          <View
            testID="recap-segments"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: Math.max(1, cards.length), now: index + 1 }}
            className="flex-row gap-1.5 px-4 pt-3"
          >
            {(cards.length > 0 ? cards : ['tiles']).map((card, i) => (
              <View
                key={card}
                testID={`recap-segment-${i}`}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  i <= index ? 'bg-brand-on' : 'bg-brand-on/30',
                )}
              />
            ))}
          </View>
          <View className="min-h-11 flex-row items-center justify-between gap-3 px-4 pt-2">
            <Text
              testID="recap-eyebrow"
              numberOfLines={1}
              className="min-w-0 flex-1 text-subhead font-semibold uppercase tracking-widest text-brand-on"
            >
              {PROGRESS_COPY.recapEyebrow}
              {recap
                ? ` · ${formatDateRange(recap.weekStart, recap.weekEnd, 'short', { timeZone: 'UTC' })}`
                : ''}
            </Text>
            <IconButton
              testID="recap-close"
              accessibilityLabel={PROGRESS_COPY.recapClose}
              icon={<Icon name="close" size={26} color={colors.onBrand} />}
              onPress={close}
            />
          </View>

          {recap && current ? (
            <View className="flex-1 px-4 pt-3">
              {/* Tap targets: the left third goes back, the rest goes on (like a story). */}
              <View className="absolute inset-0 flex-row" pointerEvents="box-none">
                <Pressable
                  testID="recap-prev"
                  accessibilityRole="button"
                  accessibilityLabel={PROGRESS_COPY.recapPrevious}
                  onPress={() => step(-1)}
                  className="w-1/3"
                />
                <Pressable
                  testID="recap-next"
                  accessibilityRole="button"
                  accessibilityLabel={PROGRESS_COPY.recapNext}
                  onPress={() => step(1)}
                  className="flex-1"
                />
              </View>
              <View pointerEvents="none" className="gap-4">
                {current === 'tiles' ? <TilesCard recap={recap} quiet={quiet} /> : null}
                {current === 'dish' && recap.dishOfWeek ? (
                  <DishCard dish={recap.dishOfWeek} />
                ) : null}
                {current === 'stats' ? (
                  <StatsCard recap={recap} showXp={showXp} biscuit={biscuit} />
                ) : null}
              </View>
            </View>
          ) : (
            <View className="flex-1" />
          )}

          <View className="px-4 pb-4">
            <PressableScale
              testID="recap-plan-next"
              accessibilityRole="button"
              accessibilityLabel={PROGRESS_COPY.recapPlanNext}
              onPress={() => {
                haptics.selection();
                router.navigate('/plan');
              }}
              className="min-h-12 items-center justify-center rounded-control bg-surface px-4"
            >
              <Text className="text-callout font-bold text-brand">
                {PROGRESS_COPY.recapPlanNext}
              </Text>
            </PressableScale>
          </View>
        </View>
      )}
    </Screen>
  );
}
