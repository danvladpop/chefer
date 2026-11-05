import { useT } from '@/lib/i18n';
import { StickyNote } from 'lucide-react';
import { createTranslator, type Translator } from '@chefer/i18n';
import type { LastEditedByOtherDto } from '@chefer/types';
import { editorLabelT } from '../lib/copy';
import { formatShortDayT } from '../lib/dates';

// English for callers that have no translator yet (the line helpers below take
// the UI language's `t` when they are given one).
const EN = createTranslator('en').t;

/** Upper-cases the first letter, for a line that starts with "a former trainer". */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Ana changed your routine · 2 Oct" / "Ana (former trainer) changed …" / "A former trainer changed …". */
export function routineChangedLine(stamp: LastEditedByOtherDto, t: Translator['t'] = EN): string {
  return sentence(
    t('coaching.stamps.routineChanged', {
      trainer: editorLabelT(stamp, t),
      date: formatShortDayT(stamp.at, t),
    }),
  );
}

/** "Set by Ana" / "Set by Ana (former trainer)". */
export function setByLine(
  stamp: { name: string; former?: boolean | undefined },
  t: Translator['t'] = EN,
): string {
  return t('coaching.stamps.setBy', { name: editorLabelT(stamp, t) });
}

/**
 * "Changed by Ana · 2 Oct": shown on exactly the rows the other person changed.
 * A trainer who no longer coaches the client reads "Ana (former trainer)".
 */
export function ChangedByLine({ stamp }: { stamp: LastEditedByOtherDto }) {
  const { t } = useT();
  return (
    <p className="min-w-0 break-words text-xs text-gray-500" data-testid="changed-by">
      {t('coaching.stamps.changedBy', {
        name: editorLabelT(stamp, t),
        date: formatShortDayT(stamp.at, t),
      })}
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
  const { t } = useT();
  return (
    <div
      className="flex min-w-0 items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"
      data-testid="trainer-note"
    >
      <StickyNote className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words">
        {t('coaching.stamps.trainerNote', { trainer: trainerName, note })}
      </p>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-my-1.5 -mr-1 flex min-h-11 shrink-0 items-center px-2 text-xs font-semibold underline underline-offset-2"
        >
          {t('coaching.stamps.removeNote')}
        </button>
      )}
    </div>
  );
}
