import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import type { ProgressSummary } from '@chefer/types';
import { PressableScale, ProgressBar, ProgressRing, Text, useThemeColors } from '@chefer/ui-mobile';
import {
  flameWeeksLabel,
  flameWeeksShort,
  levelLabel,
  PROGRESS_COPY,
  xpToRankLine,
} from '@chefer/utils';
import { FlameSheet } from './flame-sheet';
import { WeekDots } from './week-dots';

// ProgressStrip (mockup 01): the first card on Today — level ring, rank, the
// XP bar to the next rank, the flame in weeks and this week's seven dots with
// "2 of 3 active days". Tapping it opens the Flame sheet. Gated: nothing
// renders (and no progress.* call is made) unless Kitchen progress is on.
//
//  - `showFlameOnToday` off hides the whole strip (progress still counts);
//  - `showXp` off keeps the flame row and drops the level, rank and XP bar.
//
// Motion: the ring and the bar are the shared MO-06 progress primitives; the
// press is MO-01 (`card` scale).

/** Below this width the "2 of 3 active days" text sits under the dots instead of beside them. */
const INLINE_ACTIVE_DAYS_MIN_WIDTH = 360;

export function ProgressStripView({
  summary,
  onPress,
}: {
  summary: ProgressSummary;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const { xp, rank, nextRank, flame, settings } = summary;
  const showLevel = settings.showXp;
  const inline = width >= INLINE_ACTIVE_DAYS_MIN_WIDTH;
  const flameText = flame.current > 0 ? flameWeeksShort(flame.current) : null;
  const xpLine = xpToRankLine(xp.xpIntoLevel, xp.xpForLevel, xp.level, nextRank);
  const activeDays = `${Math.min(flame.thisWeek.activeDays, flame.thisWeek.goal)} of ${flame.thisWeek.goal}`;

  const a11y = [
    showLevel ? `${levelLabel(xp.level)}, ${rank.title}. ${xpLine}.` : null,
    flame.current > 0 ? `${PROGRESS_COPY.flameTitle}: ${flameWeeksLabel(flame.current)}.` : null,
    `${activeDays} ${PROGRESS_COPY.activeDays}.`,
  ]
    .filter((p): p is string => p !== null)
    .join(' ');

  const activeDaysText = (
    <View className={inline ? 'w-24 items-end' : 'items-end'}>
      <Text
        testID="progress-strip-active-days"
        maxFontSizeMultiplier={1.3}
        className="text-right text-subhead text-label-secondary"
      >
        {activeDays}
        {inline ? '\n' : ' '}
        {PROGRESS_COPY.activeDays}
      </Text>
    </View>
  );

  return (
    <PressableScale
      testID="progress-strip"
      pressScale="card"
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint={PROGRESS_COPY.stripFlameHint}
      onPress={onPress}
      className="gap-3 rounded-card border border-separator bg-brand-tint p-4"
    >
      {showLevel ? (
        <View className="flex-row items-center gap-4">
          {/* MO-06: the ring fills to the level's progress on first show. */}
          <ProgressRing
            testID="progress-strip-ring"
            progress={xp.xpForLevel > 0 ? xp.xpIntoLevel / xp.xpForLevel : 0}
            size={64}
            strokeWidth={6}
            color={colors.brand}
            trackColor={colors.surface}
          >
            <Text
              testID="progress-strip-level"
              maxFontSizeMultiplier={1.2}
              className="text-title3 font-bold text-brand"
            >
              {xp.level}
            </Text>
          </ProgressRing>
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row items-baseline justify-between gap-2">
              <Text
                testID="progress-strip-rank"
                numberOfLines={1}
                className="min-w-0 shrink text-headline font-bold text-label"
              >
                {rank.title}
              </Text>
              {flameText ? (
                <Text
                  testID="progress-strip-flame"
                  className="text-callout font-bold text-attention"
                >
                  🔥 {flameText}
                </Text>
              ) : null}
            </View>
            <Text testID="progress-strip-xp" className="text-subhead text-label-secondary">
              {xpLine}
            </Text>
            <ProgressBar
              testID="progress-strip-xp-bar"
              progress={xp.xpForLevel > 0 ? xp.xpIntoLevel / xp.xpForLevel : 0}
              color={colors.attention}
              className="h-2 bg-surface"
            />
          </View>
        </View>
      ) : (
        <View className="flex-row items-center justify-between gap-3">
          <Text
            testID="progress-strip-flame"
            className="min-w-0 flex-1 text-title3 font-bold text-attention"
          >
            🔥 {flame.current > 0 ? flameWeeksLabel(flame.current) : PROGRESS_COPY.flameTitle}
          </Text>
        </View>
      )}
      <View className={inline ? 'flex-row items-end gap-3' : 'gap-2'}>
        <View className="min-w-0 flex-1">
          <WeekDots days={flame.thisWeek.days} testID="progress-strip-days" />
        </View>
        {activeDaysText}
      </View>
    </PressableScale>
  );
}

/** The strip with its Flame sheet. The caller has already checked the gate and `showFlameOnToday`. */
export function ProgressStrip({ summary }: { summary: ProgressSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ProgressStripView summary={summary} onPress={() => setOpen(true)} />
      <FlameSheet visible={open} onClose={() => setOpen(false)} flame={summary.flame} />
    </>
  );
}
