import { supersetRuns, supersetSlot, type SupersetItem } from '@chefer/utils';

/** "Superset A · 90 s rest after each round" above a superset's first exercise. */
export function SupersetHeading({
  exercises,
  index,
}: {
  exercises: readonly (SupersetItem & { restSec: number })[];
  index: number;
}) {
  const slot = supersetSlot(exercises, index);
  if (slot?.position !== 0) return null;
  const run = supersetRuns(exercises).find((r) => r.start === index);
  const restSec = (run && exercises[run.end]?.restSec) ?? exercises[index]?.restSec ?? 0;
  return (
    <p
      className="flex items-center gap-2 px-1 pt-1 text-xs"
      data-testid={`routine-superset-${slot.label}`}
    >
      <span className="h-3.5 w-1 shrink-0 rounded-full bg-violet-500" aria-hidden="true" />
      <span className="font-semibold text-violet-800">Superset {slot.label}</span>
      <span className="min-w-0 truncate text-gray-400">{restSec} s rest after each round</span>
    </p>
  );
}
