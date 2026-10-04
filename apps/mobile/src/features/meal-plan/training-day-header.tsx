import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PlanTrainingBasis, PlanTrainingDay } from '@chefer/types';
import { colors, ExplainSheet, Text } from '@chefer/ui-mobile';
import {
  cn,
  preRunNote,
  trainingDayHeaderCopy,
  trainingExplainCopy,
  trainingGlyph,
} from '@chefer/utils';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import {
  proteinOnlyTrainingExplain,
  proteinOnlyTrainingHeader,
} from '../numbers-mode/numbers-mode-copy';

// ─── Training days on the Plan tab (UX-06, T-06.4) ─────────────────────────────
// The day header above a training day's meals, its Explain sheet (PAT-1) and
// the evening-before note for a long run. The header is one button: title,
// target and bonus lines come from `trainingDayHeaderCopy`, so a user whose
// goal gets no bump sees the title only — never a kcal number that is not the
// day's real target.

export function TrainingDayHeader({
  day,
  isToday,
  onPress,
  testID = 'plan-training-header',
}: {
  day: PlanTrainingDay;
  isToday: boolean;
  onPress: () => void;
  testID?: string;
}) {
  // WP-08: protein-only mode shows the protein bump of a lifting day, never calories.
  const { proteinOnly } = useNumbersMode();
  const copy = proteinOnly
    ? proteinOnlyTrainingHeader(day)
    : trainingDayHeaderCopy(day, { isToday });
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={copy.a11yLabel}
      onPress={onPress}
      className={cn(
        'min-h-11 flex-row items-center gap-2 rounded-xl px-3 py-2',
        day.applied ? 'bg-accent' : 'bg-gray-50',
      )}
    >
      <Ionicons name={trainingGlyph(day.kind)} size={18} color={colors.primary} />
      <View className="min-w-0 flex-1">
        <Text testID={`${testID}-title`} className="text-sm font-semibold text-primary">
          {copy.title}
        </Text>
        {copy.targetLine ? (
          <Text testID={`${testID}-target`} className="text-xs text-primary/80">
            {copy.targetLine}
          </Text>
        ) : null}
        {copy.bonusLine ? (
          <Text testID={`${testID}-bonus`} className="text-xs text-primary/80">
            {copy.bonusLine}
          </Text>
        ) : null}
      </View>
      <Ionicons name="information-circle-outline" size={20} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** The evening before a long run: one carb-snack idea, quietly. */
export function PreRunNote({ snack }: { snack?: string | undefined }) {
  return (
    <View
      testID="plan-pre-run-note"
      className="flex-row items-start gap-2 rounded-xl bg-gray-50 px-3 py-2"
    >
      <Ionicons name="walk-outline" size={16} color={colors.mutedForeground} />
      <Text className="min-w-0 flex-1 text-xs text-gray-600">{preRunNote(snack)}</Text>
    </View>
  );
}

export function TrainingExplainSheet({
  visible,
  onClose,
  days,
  basis,
}: {
  visible: boolean;
  onClose: () => void;
  days: readonly PlanTrainingDay[];
  basis: PlanTrainingBasis | null;
}) {
  const { proteinOnly } = useNumbersMode();
  const copy = proteinOnly
    ? proteinOnlyTrainingExplain({ days, basis })
    : trainingExplainCopy({ days, basis });
  return (
    <ExplainSheet
      visible={visible}
      onClose={onClose}
      eyebrow={copy.eyebrow}
      title={copy.title}
      sentence={copy.sentence}
      rows={copy.rows}
      footnote={copy.footnote}
      testID="training-explain-sheet"
      action={{
        label: copy.actionLabel,
        onPress: () => {
          onClose();
          router.push('/gym/settings');
        },
      }}
    />
  );
}
