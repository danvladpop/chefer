import { View } from 'react-native';
import { ListRow, ListSection, Text } from '@chefer/ui-mobile';
import { workoutTypeLabel } from '@chefer/utils';
import { useT } from '../../../lib/i18n';
import type { RoutineDayDraft } from '../../gym/routine/types';

// ─── A routine day's workout type, as the trainer sees it (PRD 2026-10 §4.3) ──
// A client who trains in "Keep it simple" plans their week as workout types ("Tue · Yoga"); a type-only
// day has no exercises. The trainer's editor shows the type on every day that has one and lets the
// trainer set or change it through My week's own picker (opened by the screen, one sheet for all days).

export function isTypeOnlyDay(day: Pick<RoutineDayDraft, 'workoutType' | 'exercises'>): boolean {
  return Boolean(day.workoutType) && day.exercises.length === 0;
}

export function DayWorkoutType({
  day,
  clientName,
  onPress,
  testID,
}: {
  day: RoutineDayDraft;
  clientName: string;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useT();
  const label = day.workoutType ? workoutTypeLabel(day.workoutType) : null;
  return (
    <View className="gap-1.5">
      <ListSection>
        <ListRow
          testID={testID}
          title={t('coaching.trainer.profile.workoutType.label')}
          value={label ?? t('coaching.trainer.profile.workoutType.none')}
          accessibilityHint={t('coaching.trainer.profile.workoutType.pickHint')}
          onPress={onPress}
        />
      </ListSection>
      {label && isTypeOnlyDay(day) ? (
        <Text testID={`${testID}-type-only`} className="text-caption text-label-secondary">
          {t('coaching.trainer.profile.workoutType.typeOnly', { type: label, client: clientName })}
        </Text>
      ) : null}
    </View>
  );
}
