import { ActivityIndicator, Pressable, View } from 'react-native';
import { COACHING_COPY, type RoutineDto, type RoutineListItemDto } from '@chefer/types';
import { ErrorState, Sheet, Text } from '@chefer/ui-mobile';
import { normalizeSupersets } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { newId } from '../../gym/offline/ids';
import { MAX_DAYS, MAX_EXERCISES_PER_DAY, type RoutineDraft } from '../../gym/routine/types';

// ─── "Fill from one of my routines" (spec §2.5) ───────────────────────────────
// Copies one of the TRAINER's own routines into the open draft: days and exercises as new rows (no server
// ids, so it is a normal save), Chefer's own exercises only (custom exercises are skipped and counted), no
// notes, no stamps. The client's routine id, name and version stay, so the save is version-checked as usual.

export type FillResult = { draft: RoutineDraft; copied: number; skipped: number };

export function fillDraftFromRoutine(
  draft: RoutineDraft,
  source: RoutineDto,
  isCurated: (exerciseId: string) => boolean,
): FillResult {
  let copied = 0;
  let skipped = 0;
  const days = source.days.slice(0, MAX_DAYS).map((day) => {
    const rows = day.exercises.slice(0, MAX_EXERCISES_PER_DAY).filter((e) => {
      if (isCurated(e.exerciseId)) return true;
      skipped += 1;
      return false;
    });
    copied += rows.length;
    return {
      key: newId(),
      name: day.name,
      plannedWeekday: day.plannedWeekday,
      exercises: normalizeSupersets(
        rows.map((e) => ({
          key: newId(),
          exerciseId: e.exerciseId,
          sets: e.sets,
          repMin: e.repMin,
          repMax: e.repMax,
          targetRir: e.targetRir,
          restSec: e.restSec,
          supersetGroup: e.supersetGroup,
          notes: null,
          trainerNote: null,
        })),
      ),
    };
  });
  return { draft: { ...draft, days }, copied, skipped };
}

/** The sheet listing the trainer's own routines; picking one calls `onPick` with its id. */
export function FillFromMineSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (routine: RoutineListItemDto) => void;
}) {
  const list = trpc.gym.routine.list.useQuery(undefined, { enabled: visible });
  const routines = (list.data ?? []).filter((r) => !r.archived && r.dayCount > 0);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={COACHING_COPY.trainer.fillFromMine}
      testID="trainer-fill"
    >
      {list.isPending ? (
        <ActivityIndicator testID="trainer-fill-loading" />
      ) : list.isError ? (
        <ErrorState testID="trainer-fill-error" onRetry={() => void list.refetch()} />
      ) : routines.length === 0 ? (
        <Text testID="trainer-fill-empty" variant="muted">
          You have no routines of your own to copy yet.
        </Text>
      ) : (
        <View>
          {routines.map((routine) => (
            <Pressable
              key={routine.id}
              testID={`trainer-fill-${routine.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${routine.name}, ${routine.dayCount} days`}
              onPress={() => onPick(routine)}
              className="min-h-12 justify-center border-b border-border px-1 py-2 active:bg-muted"
            >
              <Text className="font-medium" numberOfLines={1}>
                {routine.name}
              </Text>
              <Text variant="muted" className="text-xs">
                {routine.dayCount} {routine.dayCount === 1 ? 'day' : 'days'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}
