import { StickyNote } from 'lucide-react';
import { COACHING_COPY } from '@chefer/types';
import { formatShortDay } from '../lib/dates';

/** "Changed by Ana · 2 Oct": shown on exactly the rows the other person changed. */
export function ChangedByLine({ name, at }: { name: string; at: string }) {
  return (
    <p className="min-w-0 break-words text-xs text-gray-500" data-testid="changed-by">
      {COACHING_COPY.stamps.changedBy(name, formatShortDay(at))}
    </p>
  );
}

/** "Ana: knees out, slow eccentric", with the client's "Remove note" when it can be removed. */
export function TrainerNoteLine({
  trainerName,
  note,
  onRemove,
}: {
  trainerName: string;
  note: string;
  onRemove?: () => void;
}) {
  return (
    <div
      className="flex min-w-0 items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"
      data-testid="trainer-note"
    >
      <StickyNote className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words">
        {COACHING_COPY.stamps.trainerNote(trainerName, note)}
      </p>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-my-1.5 -mr-1 flex min-h-11 shrink-0 items-center px-2 text-xs font-semibold underline underline-offset-2"
        >
          {COACHING_COPY.stamps.removeNote}
        </button>
      )}
    </div>
  );
}
