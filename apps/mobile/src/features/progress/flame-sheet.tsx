import { useState } from 'react';
import { View } from 'react-native';
import type { FlameInfo } from '@chefer/types';
import { FLAME_MILESTONES } from '@chefer/types';
import { SelectSheet, Sheet, Text } from '@chefer/ui-mobile';
import {
  activeDaysLabel,
  changeGoalLabel,
  cn,
  flameBestLabel,
  flameWeeksLabel,
  flameWeeksShort,
  goalDaysLabel,
  pilotLightsLabel,
  PROGRESS_COPY,
} from '@chefer/utils';
import { ActionButton } from '../shell/today/parts';
import { PauseCard } from './pause-card';
import { useFlameActions } from './use-flame-actions';
import { WeekDots } from './week-dots';

// The Flame sheet (mockup 05): opened from Today's strip. The big count and
// "Best: 9 weeks." (never a "you lost it" line), this week's dots with the
// explainer, pilot lights, the milestones (the next one dashed), the training
// streak when there is one, the weekly goal and the pause. MO-02 sheet motion
// comes from the shared `Sheet`.

const GOALS = [1, 2, 3, 4, 5, 6, 7] as const;
const GOAL_OPTIONS = GOALS.map((g) => ({ value: String(g), label: goalDaysLabel(g) }));

function Milestone({ weeks, reached, next }: { weeks: number; reached: boolean; next: boolean }) {
  return (
    <View
      testID={`flame-milestone-${weeks}`}
      accessible
      accessibilityLabel={`${flameWeeksLabel(weeks)}${reached ? ', reached' : next ? `, ${PROGRESS_COPY.flameMilestoneNext}` : ''}`}
      className="min-w-0 flex-1 items-center gap-1"
    >
      <View
        className={cn(
          'h-14 w-full items-center justify-center rounded-control',
          reached && 'border border-brand bg-brand-tint',
          next && 'border-2 border-dashed border-brand bg-surface',
          !reached && !next && 'bg-surface-sunken opacity-60',
        )}
      >
        <Text className="text-title3">{weeks >= 52 ? '👑' : '🔥'}</Text>
      </View>
      <Text
        maxFontSizeMultiplier={1.3}
        className={cn(
          'text-center text-caption',
          next ? 'font-bold text-label' : 'text-label-secondary',
        )}
      >
        {next
          ? `${flameWeeksShort(weeks)} · ${PROGRESS_COPY.flameMilestoneNext}`
          : flameWeeksShort(weeks)}
      </Text>
    </View>
  );
}

export interface FlameSheetProps {
  visible: boolean;
  onClose: () => void;
  flame: FlameInfo;
}

export function FlameSheet({ visible, onClose, flame }: FlameSheetProps) {
  const actions = useFlameActions();
  const [choosingGoal, setChoosingGoal] = useState(false);
  const { thisWeek } = flame;

  return (
    <Sheet
      testID="flame-sheet"
      visible={visible}
      onClose={onClose}
      title={PROGRESS_COPY.flameTitle}
    >
      <View className="gap-4 pb-2">
        <View className="items-center gap-1">
          <Text accessibilityElementsHidden className="text-display">
            🔥
          </Text>
          {flame.current > 0 ? (
            <Text testID="flame-count" className="text-center text-title1 font-bold text-attention">
              {flameWeeksLabel(flame.current)}
            </Text>
          ) : (
            <Text testID="flame-count" className="text-center text-headline text-label">
              {PROGRESS_COPY.flameZero}
            </Text>
          )}
          <Text className="text-center text-callout text-label-secondary">
            {PROGRESS_COPY.flameSubtitle} {flameBestLabel(flame.best)}
          </Text>
        </View>

        <View className="gap-3 rounded-card border border-separator bg-surface p-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text accessibilityRole="header" className="text-headline font-semibold text-label">
              {PROGRESS_COPY.flameThisWeek}
            </Text>
            <View className="rounded-full bg-brand-tint px-3 py-1">
              <Text className="text-subhead font-semibold text-brand">
                {activeDaysLabel(thisWeek.activeDays, thisWeek.goal)}
              </Text>
            </View>
          </View>
          <WeekDots days={thisWeek.days} labels="names" testID="flame-week" />
          <Text className="text-subhead text-label-secondary">
            {PROGRESS_COPY.flameActiveDayExplainer}
          </Text>
        </View>

        <View
          testID="flame-pilot-lights"
          className="flex-row gap-3 rounded-card border border-separator bg-surface p-4"
        >
          <Text accessibilityElementsHidden className="text-title2">
            🫙
          </Text>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-headline font-semibold text-label">
              {pilotLightsLabel(flame.pilotLights)}
            </Text>
            <Text className="text-subhead text-label-secondary">
              {PROGRESS_COPY.pilotLightsBody}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <Text accessibilityRole="header" className="text-headline font-semibold text-label">
            {PROGRESS_COPY.flameMilestonesTitle}
          </Text>
          <View className="flex-row gap-2">
            {FLAME_MILESTONES.map((m) => (
              <Milestone
                key={m}
                weeks={m}
                reached={flame.best >= m}
                next={flame.nextMilestone === m}
              />
            ))}
          </View>
        </View>

        {flame.training ? (
          <View
            testID="flame-training"
            accessible
            accessibilityLabel={`${PROGRESS_COPY.trainingRow}, ${flameWeeksLabel(flame.training.current)}. ${flameBestLabel(flame.training.best)}`}
            className="flex-row items-center justify-between gap-3 rounded-card border border-separator bg-surface p-4"
          >
            <Text className="min-w-0 flex-1 text-callout font-semibold text-label">
              🏋️ {PROGRESS_COPY.trainingRow}
            </Text>
            <Text className="text-callout text-label-secondary">
              {flameWeeksLabel(flame.training.current)}
            </Text>
          </View>
        ) : null}

        <ActionButton
          testID="flame-change-goal"
          label={changeGoalLabel(flame.goal)}
          disabled={actions.pending}
          onPress={() => setChoosingGoal(true)}
        />

        <PauseCard flame={flame} testID="flame-pause" />
      </View>

      <SelectSheet
        testID="flame-goal"
        visible={choosingGoal}
        onClose={() => setChoosingGoal(false)}
        title={PROGRESS_COPY.goalSheetTitle}
        options={GOAL_OPTIONS}
        value={String(flame.goal)}
        onChange={(goal) => {
          setChoosingGoal(false);
          actions.setGoal(Number(goal));
        }}
      />
    </Sheet>
  );
}
