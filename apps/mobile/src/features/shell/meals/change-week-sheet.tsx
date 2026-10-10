import { ActivityIndicator } from 'react-native';
import { ListRow, ListSection, Sheet, useThemeColors } from '@chefer/ui-mobile';
import { PLAN_WEEK_COPY } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { useAfterSheetExit } from '../../meal-plan/after-sheet-exit';
import type { RebalanceCheckState } from '../../tracker/rebalance-offer';
import type { WeekOffset } from './meals-model';

// "Change week" (10 Oct redesign, board WeekOptionsSheet): the old Week
// options sheet with the week named in its eyebrow and a third row into Meal
// settings. Same flows as the old shell: a new plan always asks first (the
// RegenerateConfirm, opened once this sheet is gone — iOS presents one modal
// at a time) and keeps the pinned meals; Rebalance runs the preview and is
// disabled, with the reason, when there is nothing to swap; it only exists
// for this week.

export const CHANGE_WEEK_COPY = {
  title: 'Change week',
  newPlan: (weekOffset: WeekOffset) =>
    weekOffset === 0 ? 'New plan for this week' : 'New plan for next week',
  newPlanDetail: 'Keeps pinned meals',
  rebalanceDetail: 'Swaps up to 2 meals to get back on target',
  settings: 'Meal settings',
  settingsDetail: 'Meals, days, cooking time',
} as const;

export function ChangeWeekSheet({
  visible,
  onClose,
  weekOffset,
  onNewPlan,
  regenerating,
  rebalance,
  onSettings,
}: {
  visible: boolean;
  onClose: () => void;
  weekOffset: WeekOffset;
  /** Opens the RegenerateConfirm (runs once this sheet is gone). */
  onNewPlan: () => void;
  regenerating: boolean;
  /** Absent for a week that cannot be rebalanced (next week). */
  rebalance?: { state: RebalanceCheckState; onPress: () => void } | undefined;
  /** Pushes Meal settings (runs once this sheet is gone). */
  onSettings: () => void;
}) {
  const colors = useThemeColors();
  const afterExit = useAfterSheetExit();
  const rebalanceState = rebalance?.state;
  const onTrack = rebalanceState === 'on-track';
  const checking = rebalanceState === 'loading';
  const spinner = <ActivityIndicator size="small" color={colors.brand} />;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={afterExit.onExited}
      eyebrow={weekOffset === 0 ? 'This week' : 'Next week'}
      title={CHANGE_WEEK_COPY.title}
      testID="change-week-sheet"
    >
      <ListSection className="mb-4">
        <ListRow
          testID="change-week-new-plan"
          title={CHANGE_WEEK_COPY.newPlan(weekOffset)}
          subtitle={CHANGE_WEEK_COPY.newPlanDetail}
          icon={<Icon name="refresh" color={colors.brand} />}
          disabled={regenerating}
          {...(regenerating && { accessory: spinner })}
          onPress={() => {
            afterExit.schedule(onNewPlan);
            onClose();
          }}
        />
        {rebalance ? (
          <ListRow
            testID="change-week-rebalance"
            title={PLAN_WEEK_COPY.rebalance.title}
            subtitle={
              onTrack
                ? PLAN_WEEK_COPY.rebalance.onTrack
                : rebalanceState === 'error'
                  ? PLAN_WEEK_COPY.rebalance.error
                  : CHANGE_WEEK_COPY.rebalanceDetail
            }
            icon={<Icon name="rebalance" color={colors.brand} />}
            disabled={onTrack || checking}
            {...(checking && { accessory: spinner })}
            onPress={() => {
              onClose();
              rebalance.onPress();
            }}
          />
        ) : null}
        <ListRow
          testID="change-week-settings"
          title={CHANGE_WEEK_COPY.settings}
          subtitle={CHANGE_WEEK_COPY.settingsDetail}
          icon={<Icon name="gymSettings" color={colors.brand} />}
          onPress={() => {
            afterExit.schedule(onSettings);
            onClose();
          }}
        />
      </ListSection>
    </Sheet>
  );
}
