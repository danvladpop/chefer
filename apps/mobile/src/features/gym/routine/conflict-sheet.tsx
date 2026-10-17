import { View } from 'react-native';
import { COACHING_COPY, trainerNameOrFallback, type RoutineDto } from '@chefer/types';
import { Sheet, Text } from '@chefer/ui-mobile';
import { TrainButton } from '../../shell/train/train-button';
import { conflictOtherName } from './conflict';

// The routine save-conflict sheet (gym_plan.md §5.4, spec §9.1), shared by the client's editor and the
// trainer's editor. "Keep mine" re-saves on the newer version, "Use the other version" reloads. At API
// level 6 it names the other person ("Ana changed this routine while you were editing"); older servers
// and same-person edits keep the generic copy.

export function RoutineConflictSheet({
  current,
  onKeepMine,
  onUseTheirs,
  onClose,
  testID,
}: {
  /** The server's copy from the CONFLICT error, or null when there is no conflict (sheet closed). */
  current: RoutineDto | null;
  onKeepMine: (current: RoutineDto) => void;
  onUseTheirs: (current: RoutineDto) => void;
  onClose: () => void;
  /** Default `gym-routine-editor-conflict`; the buttons get `-keep-mine`, `-use-theirs`, `-version`, `-message`. */
  testID?: string;
}) {
  const base = testID ?? 'gym-routine-editor-conflict';
  const other = current ? conflictOtherName(current) : null;
  const named = other ? trainerNameOrFallback(other) : null;
  return (
    <Sheet
      visible={current !== null}
      onClose={onClose}
      title={named ? 'Routine changed' : 'Changed on another device'}
      testID={base}
      footer={
        <View className="gap-2">
          <TrainButton
            testID={`${base}-keep-mine`}
            label="Keep mine"
            size="lg"
            onPress={() => {
              if (current) onKeepMine(current);
            }}
          />
          <TrainButton
            testID={`${base}-use-theirs`}
            label="Use the other version"
            variant="outline"
            onPress={() => {
              if (current) onUseTheirs(current);
            }}
          />
        </View>
      }
    >
      <Text testID={`${base}-message`} className="text-subhead text-label-secondary">
        {named
          ? `${COACHING_COPY.stamps.conflict(named)}. `
          : 'This routine changed on another device. '}
        Keep mine re-saves your edits with the newer version; use the other version reloads it and
        discards your edits here.
      </Text>
      {current ? (
        <Text
          testID={`${base}-version`}
          className="self-start rounded-full bg-brand-tint px-2 text-caption font-semibold text-brand"
        >
          Server version {current.version}
        </Text>
      ) : null}
    </Sheet>
  );
}
