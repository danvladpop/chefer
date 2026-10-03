import { View } from 'react-native';
import type { WorkoutSessionDoc } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';

// UX-GYM-02: starting a workout while a different one is in progress used to
// reopen the old one silently (`startWorkout` returns the existing session).
// Every start action on Gym Today asks first. Three choices, so this is a
// `Sheet` with three buttons: `ConfirmSheet` only has confirm / cancel.

/** Completed working sets — what "Finish" would keep, what "Discard" would lose. */
export function workingSetsDone(session: WorkoutSessionDoc): number {
  return session.exercises.reduce(
    (n, se) => n + se.sets.filter((s) => !s.isWarmup && s.completedAt !== null).length,
    0,
  );
}

export interface StartConflictSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The workout already in progress. */
  session: WorkoutSessionDoc;
  /** What the user just tried to start, e.g. "Lower A" or "a freestyle workout". */
  targetName: string;
  onResume: () => void;
  onFinishAndStart: () => void;
  onDiscardAndStart: () => void;
}

export function StartConflictSheet({
  visible,
  onClose,
  session,
  targetName,
  onResume,
  onFinishAndStart,
  onDiscardAndStart,
}: StartConflictSheetProps) {
  const done = workingSetsDone(session);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`${session.name} is in progress`}
      testID="gym-start-conflict"
    >
      <Text testID="gym-start-conflict-body">
        {done > 0
          ? `You have ${String(done)} ${done === 1 ? 'set' : 'sets'} logged in ${session.name}. What should happen to it before you start ${targetName}?`
          : `${session.name} is still open. What should happen to it before you start ${targetName}?`}
      </Text>
      <View className="gap-2 pt-2">
        <Button testID="gym-start-conflict-resume" size="lg" onPress={onResume}>
          {`Resume ${session.name}`}
        </Button>
        {done > 0 ? (
          <Button
            testID="gym-start-conflict-finish"
            size="lg"
            variant="outline"
            onPress={onFinishAndStart}
          >
            Finish it & start
          </Button>
        ) : null}
        <Button
          testID="gym-start-conflict-discard"
          size="lg"
          variant="destructive"
          onPress={onDiscardAndStart}
        >
          {done > 0 ? 'Discard it & start' : 'Discard & start'}
        </Button>
      </View>
    </Sheet>
  );
}
