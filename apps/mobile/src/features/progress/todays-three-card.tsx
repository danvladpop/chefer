import { View } from 'react-native';
import { router } from 'expo-router';
import type { TodaysThree, TodaysThreeQuest } from '@chefer/types';
import {
  AnimatedCheck,
  PressableScale,
  ProgressBar,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import { bonusLabel, cn, PROGRESS_COPY, questDetail, questLabel, xpLabel } from '@chefer/utils';
import { questTarget } from './quest-links';
import { useProgressSummary } from './use-progress';

// Today's three (mockup 01): three small things worth doing today, each with
// its XP, a bonus when all three are done and a bar for how far along. A tap
// on an open one opens the place to do it. The check is the shared MO-16
// check-off; the bar is the MO-06 progress primitive. No tip-jar line (P2).
// Hidden when there is nothing real to suggest, or "Show XP & levels" is off.

function QuestRow({ quest }: { quest: TodaysThreeQuest }) {
  const colors = useThemeColors();
  const detail = questDetail(quest);
  const label = `${questLabel(quest)}${detail ? ` · ${detail}` : ''}`;
  const open = () => {
    const target = questTarget(quest);
    if (target.mode === 'navigate') router.navigate(target.href);
    else router.push(target.href);
  };
  return (
    <PressableScale
      testID={`todays-three-${quest.id}`}
      accessibilityRole={quest.done ? 'text' : 'button'}
      accessibilityLabel={`${label}, ${xpLabel(quest.xp)}${quest.done ? ', done' : ''}`}
      accessibilityState={{ disabled: quest.done, checked: quest.done }}
      disabled={quest.done}
      onPress={open}
      className="min-h-11 flex-row items-center gap-3 py-1"
    >
      <AnimatedCheck
        checked={quest.done}
        size={28}
        fillColor={colors.positive}
        checkColor={colors.onBrand}
        ringColor={colors.separator}
        emptyColor={colors.surface}
      />
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            'text-callout',
            quest.done ? 'text-label-tertiary line-through' : 'text-label',
          )}
        >
          {questLabel(quest)}
          {detail ? <Text className="text-subhead text-label-secondary"> · {detail}</Text> : null}
        </Text>
      </View>
      <Text className="text-callout font-semibold text-attention">+{quest.xp}</Text>
    </PressableScale>
  );
}

export function TodaysThreeCardView({ three }: { three: TodaysThree }) {
  const colors = useThemeColors();
  const done = three.quests.filter((q) => q.done).length;
  return (
    <View
      testID="todays-three"
      className="gap-2 rounded-card border border-separator bg-surface p-4"
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-title3 font-bold text-label"
        >
          {PROGRESS_COPY.todaysThreeTitle}
        </Text>
        <View className="rounded-full bg-brand-tint px-3 py-1">
          <Text testID="todays-three-bonus" className="text-subhead font-semibold text-brand">
            {bonusLabel(three.bonusXp)}
          </Text>
        </View>
      </View>
      <View>
        {three.quests.map((quest) => (
          <QuestRow key={quest.id} quest={quest} />
        ))}
      </View>
      <ProgressBar
        testID="todays-three-bar"
        progress={three.quests.length > 0 ? done / three.quests.length : 0}
        color={colors.positive}
        className="h-1.5 bg-surface-sunken"
        accessibilityLabel={`${done} / ${three.quests.length}`}
      />
      <Text testID="todays-three-footer" className="text-subhead text-label-secondary">
        {three.allDone ? PROGRESS_COPY.todaysThreeAllDone : PROGRESS_COPY.todaysThreeFooter}
      </Text>
    </View>
  );
}

export function TodaysThreeCard() {
  const { summary } = useProgressSummary();
  if (!summary?.todaysThree || !summary.settings.showXp) return null;
  // Low-intake guard (idea 59, tech-plan §3.6): clients drop the protein quest.
  const quests = summary.quiet
    ? summary.todaysThree.quests.filter((q) => q.kind !== 'PROTEIN')
    : summary.todaysThree.quests;
  if (quests.length === 0) return null;
  return <TodaysThreeCardView three={{ ...summary.todaysThree, quests }} />;
}
