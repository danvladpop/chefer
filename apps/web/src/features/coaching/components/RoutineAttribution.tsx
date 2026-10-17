import { StickyNote } from 'lucide-react';
import { COACHING_COPY, editorLabel, type LastEditedByOtherDto } from '@chefer/types';
import { formatShortDay } from '../lib/dates';

/** Upper-cases the first letter, for a line that starts with "a former trainer". */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Ana changed your routine · 2 Oct" / "Ana (former trainer) changed …" / "A former trainer changed …". */
export function routineChangedLine(stamp: LastEditedByOtherDto): string {
  return sentence(
    COACHING_COPY.stamps.routineChanged(editorLabel(stamp), formatShortDay(stamp.at)),
  );
}

/** "Set by Ana" / "Set by Ana (former trainer)". */
export function setByLine(stamp: { name: string; former?: boolean | undefined }): string {
  return COACHING_COPY.stamps.setBy(editorLabel(stamp));
}

/**
 * "Changed by Ana · 2 Oct": shown on exactly the rows the other person changed.
 * A trainer who no longer coaches the client reads "Ana (former trainer)".
 */
export function ChangedByLine({ stamp }: { stamp: LastEditedByOtherDto }) {
  return (
    <p className="min-w-0 break-words text-xs text-gray-500" data-testid="changed-by">
      {COACHING_COPY.stamps.changedBy(editorLabel(stamp), formatShortDay(stamp.at))}
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
