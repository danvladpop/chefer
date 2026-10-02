import { pressControl } from '@chefer/ui';
import { cn, supersetRuns, supersetSlot, type SupersetItem } from '@chefer/utils';

/**
 * "Superset A · 90 s rest after each round" above a superset's first exercise.
 * The editors pass `onUngroup` for the "Ungroup" action (plan-library-supersets
 * S3); read-only screens (Routine tab, Today) leave it out.
 */
export function SupersetHeading({
  exercises,
  index,
  onUngroup,
}: {
  exercises: readonly (SupersetItem & { restSec: number })[];
  index: number;
  onUngroup?: () => void;
}) {
  const slot = supersetSlot(exercises, index);
  if (slot?.position !== 0) return null;
  const run = supersetRuns(exercises).find((r) => r.start === index);
  const restSec = (run && exercises[run.end]?.restSec) ?? exercises[index]?.restSec ?? 0;
  return (
    <div
      className="flex min-w-0 items-center gap-2 px-1 pt-1 text-xs"
      data-testid={`routine-superset-${slot.label}`}
    >
      <span className="h-3.5 w-1 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
      <span className="shrink-0 font-semibold text-violet-800">Superset {slot.label}</span>
      <span className="min-w-0 flex-1 truncate text-gray-400">
        {restSec} s rest after each round
      </span>
      {onUngroup && (
        <button
          type="button"
          onClick={onUngroup}
          aria-label={`Ungroup superset ${slot.label}`}
          data-testid={`routine-superset-ungroup-${slot.label}`}
          // MO-01 press feedback; the hit area grows to 44 px via touch-target.
          className={cn(
            'touch-target relative -my-1.5 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-violet-700 hover:bg-violet-50',
            pressControl,
          )}
        >
          Ungroup
        </button>
      )}
    </div>
  );
}
