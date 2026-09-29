import { useEffect, useMemo } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import type { GymBootstrap, WeightUnit } from '@chefer/types';
import { ChangeNoticeCard, useSnackbar } from '@chefer/ui-mobile';
import { formatLoad, snapshotTargets, targetDiff, type TargetDiffRow } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { captureGymEvent } from '../analytics';
import {
  clearTargetNoticeFor,
  setTargetNotice,
  useTargetNotice,
  type TargetNotice,
} from '../offline/session-corrections';
import { gymBootstrapQueryKey, libraryLookup } from '../use-gym-bootstrap';

// "Next time changed after your edit" (UX-44, T-44.4, PAT-14). After a
// corrected or deleted session has synced and the bootstrap has been refetched
// (the server recomputed), Gym Today shows ONE ChangeNoticeCard naming the
// exercises whose next target moved — never silently (D2). `Use the new
// targets` just dismisses it; `Keep the old ones` writes the old values back
// as the user's own overrides (`progression.setOverride`, "Your target wins").

const MAX_ROWS = 3;

function weekdayName(localDate: string): string {
  return new Date(`${localDate}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}

/** "62.5 kg" when the weight moved, else the rep target ("10 reps"). */
function describeTarget(row: TargetDiffRow, side: 'before' | 'after', unit: WeightUnit): string {
  const target = row[side];
  if (row.before.weightKg !== row.after.weightKg) return formatLoad(target.weightKg, unit);
  const reps = target.reps[0] ?? 0;
  return `${reps} ${reps === 1 ? 'rep' : 'reps'}`;
}

/** The rows to show now, or null while the notice is still waiting on the sync + refetch. */
export function noticeRows(
  notice: TargetNotice,
  bootstrap: GymBootstrap,
  dataUpdatedAt: number,
): TargetDiffRow[] | null {
  if (notice.syncedAt === null || dataUpdatedAt < Date.parse(notice.syncedAt)) return null;
  const after = snapshotTargets(
    bootstrap.progressions,
    notice.before.map((b) => b.exerciseId),
  );
  return targetDiff(notice.before, after);
}

export function TargetChangeNotice({
  bootstrap,
  dataUpdatedAt,
}: {
  bootstrap: GymBootstrap;
  dataUpdatedAt: number;
}) {
  const notice = useTargetNotice();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();
  const setOverride = trpc.gym.progression.setOverride.useMutation();
  const rows = useMemo(
    () => (notice ? noticeRows(notice, bootstrap, dataUpdatedAt) : null),
    [notice, bootstrap, dataUpdatedAt],
  );

  // Nothing moved: no card, and the snapshot is done with.
  const settledId = notice !== null && rows?.length === 0 ? notice.sessionId : null;
  useEffect(() => {
    if (settledId !== null) clearTargetNoticeFor([settledId]);
  }, [settledId]);

  if (!notice || !rows || rows.length === 0) return null;

  const unit = bootstrap.profile?.unit ?? 'KG';
  const find = libraryLookup(bootstrap);
  const shown = rows.slice(0, MAX_ROWS);
  const more = rows.length - shown.length;
  const day = weekdayName(notice.localDate);
  const reason =
    notice.kind === 'delete'
      ? `Because you deleted ${day}’s workout.`
      : `Because you edited ${day}’s sets.`;

  return (
    <ChangeNoticeCard
      testID="gym-today-target-notice"
      title="Next time changed after your edit"
      rows={shown.map((row) => ({
        label: find(row.exerciseId)?.name ?? row.exerciseId,
        before: describeTarget(row, 'before', unit),
        after: describeTarget(row, 'after', unit),
      }))}
      reason={more > 0 ? `and ${more} more\n${reason}` : reason}
      primary={{
        label: 'Use the new targets',
        onPress: () => {
          captureGymEvent('target_notice_answered', { choice: 'new', source: 'session_edit' });
          setTargetNotice(null);
        },
      }}
      secondary={{
        label: 'Keep the old ones',
        onPress: () => {
          if (!onlineManager.isOnline()) {
            snackbar.show({ message: 'Connect to keep the old ones.' });
            return;
          }
          void Promise.all(
            rows.map((row) =>
              setOverride.mutateAsync({
                exerciseId: row.exerciseId,
                repBucket: row.repBucket,
                weightKg: row.before.weightKg,
                reps: row.before.reps,
              }),
            ),
          )
            .then(() => {
              captureGymEvent('target_notice_answered', { choice: 'keep', source: 'session_edit' });
              setTargetNotice(null);
              // The override is a progression change: pull the bootstrap that carries it.
              void queryClient.invalidateQueries({ queryKey: gymBootstrapQueryKey });
            })
            .catch(() => snackbar.show({ message: 'Couldn’t keep the old targets. Try again.' }));
        },
      }}
    />
  );
}
