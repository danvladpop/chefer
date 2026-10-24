import { View } from 'react-native';
import type { LevelInfo, Receipt, ReceiptLineCode } from '@chefer/types';
import { CountUp, ProgressBar, Text, useThemeColors } from '@chefer/ui-mobile';
import { levelLabel, PROGRESS_COPY, receiptLineLabel, xpLabel } from '@chefer/utils';

// The Kitchen receipt (mockups 02 and 03): what a cook or a workout earned,
// line by line, with the day's total counting up (MO-06 CountUp) and, when the
// summary is at hand, the level bar underneath. Hidden by its callers when
// Kitchen progress is off. The lines and their labels come from the API and
// `receiptLineLabel` (@chefer/utils), never from this file.

const LINE_ICONS: Record<ReceiptLineCode, string> = {
  WELCOME: '👋',
  LOGGED: '📒',
  ON_PLAN: '🗓️',
  FULL_DAY: '✅',
  PROTEIN_GOAL: '🥚',
  COOKED_AT_HOME: '🍳',
  FIRST_TIME: '✨',
  WORKOUT_DONE: '💪',
  PR_E1RM: '🏅',
  PR_WEIGHT: '🏅',
  PR_REPS: '🔁',
  SHOP_DONE: '🛒',
  TODAYS_THREE: '🎯',
  WEEK_GOAL: '🔥',
};

export interface KitchenReceiptProps {
  receipt: Receipt;
  /** The level bar under the lines (from `progress.summary`); omitted until it has loaded. */
  xp?: LevelInfo | undefined;
  testID?: string;
}

export function KitchenReceipt({ receipt, xp, testID = 'kitchen-receipt' }: KitchenReceiptProps) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${PROGRESS_COPY.receiptTitle}, ${xpLabel(receipt.xp)}. ${receipt.lines
        .map((l) => `${receiptLineLabel(l.code, l.detail)}, ${xpLabel(l.xp)}`)
        .join('. ')}`}
      className="gap-2 self-stretch rounded-card border border-separator bg-surface p-4"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="min-w-0 flex-1 text-headline font-semibold text-label">
          {PROGRESS_COPY.receiptTitle}
        </Text>
        {/* MO-06: the total counts up once. */}
        <CountUp
          testID={`${testID}-total`}
          value={receipt.xp}
          format={(n) => xpLabel(Math.round(n))}
          className="text-title3 font-bold text-attention"
        />
      </View>
      {receipt.lines.map((line, i) => (
        <View
          // The same code can repeat (two PRs); the order is stable.
          key={`${line.code}-${i}`}
          testID={`${testID}-line-${i}`}
          className="min-h-8 flex-row items-center gap-3"
        >
          <Text className="w-6 text-center text-body">{LINE_ICONS[line.code]}</Text>
          <Text className="min-w-0 flex-1 text-callout text-label-secondary">
            {receiptLineLabel(line.code, line.detail)}
          </Text>
          <Text className="text-callout font-semibold text-attention">+{line.xp}</Text>
        </View>
      ))}
      {receipt.capped ? (
        <Text className="text-subhead text-label-secondary">{PROGRESS_COPY.softCapNote}</Text>
      ) : null}
      {xp ? (
        <View className="mt-1 flex-row items-center gap-3 border-t border-separator pt-3">
          <Text className="text-subhead text-label-secondary">{levelLabel(xp.level)}</Text>
          <View className="min-w-0 flex-1">
            <ProgressBar
              testID={`${testID}-level-bar`}
              progress={xp.xpForLevel > 0 ? xp.xpIntoLevel / xp.xpForLevel : 0}
              color={colors.attention}
              className="h-2 bg-surface-sunken"
              accessibilityLabel={`${levelLabel(xp.level)}, ${xp.xpIntoLevel} / ${xp.xpForLevel} XP`}
            />
          </View>
          <Text className="text-subhead text-label-secondary">
            {xp.xpIntoLevel} / {xp.xpForLevel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
