import { View } from 'react-native';
import { Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { TrainButton } from './train-button';

// The live workout's list foot in the new shell (board "Workout"): Add
// exercise and Superset side by side (tinted), then Save for later (ghost)
// and Discard (danger ghost). Same handlers and limits as the old buttons.

export interface WorkoutActionsProps {
  addDisabled: boolean;
  /** Why Add exercise is off (the exercise cap), shown under it. */
  addReason: string | null;
  supersetDisabled: boolean;
  supersetTitle: string;
  onAdd: () => void;
  onSuperset: () => void;
  onSaveForLater: () => void;
  onDiscard: () => void;
}

export function WorkoutActions({
  addDisabled,
  addReason,
  supersetDisabled,
  supersetTitle,
  onAdd,
  onSuperset,
  onSaveForLater,
  onDiscard,
}: WorkoutActionsProps) {
  const { t } = useT();
  return (
    <View className="gap-3 px-2 pt-1">
      <View className="flex-row gap-2">
        <TrainButton
          testID="workout-add-exercise"
          label={t('gym.workout.view.addExercise')}
          icon="add"
          variant="tinted"
          className="flex-1"
          disabled={addDisabled}
          onPress={onAdd}
        />
        <TrainButton
          testID="workout-superset"
          label={supersetTitle}
          icon="link"
          variant="tinted"
          className="flex-1"
          accessibilityLabel={t('gym.shared.superset.title')}
          accessibilityHint={t('gym.workout.logger.screen.supersetA11yHint')}
          disabled={supersetDisabled}
          onPress={onSuperset}
        />
      </View>
      {addReason ? (
        <Text
          testID="workout-add-exercise-reason"
          className="text-center text-subhead text-label-secondary"
        >
          {addReason}
        </Text>
      ) : null}
      <View className="flex-row gap-2">
        <TrainButton
          testID="workout-save-for-later"
          label={t('gym.workout.logger.screen.saveForLater')}
          variant="ghost"
          className="flex-1"
          onPress={onSaveForLater}
        />
        <TrainButton
          testID="workout-discard"
          label={t('gym.workout.view.discard')}
          accessibilityLabel={t('gym.workout.view.discardWorkout')}
          variant="danger"
          className="flex-1"
          onPress={onDiscard}
        />
      </View>
    </View>
  );
}
