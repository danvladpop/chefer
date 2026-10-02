'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';
import { canGroupPicks, isPickLocked, SUPERSET_SHEET_HINT, togglePick } from './superset-pick';

// "Superset" sheet (plan-library-supersets S3, web twin of the phone's S2
// sheet): the day's / workout's exercises as checkboxes; 2 to
// MAX_SUPERSET_SIZE picks enable "Group as superset". The routine editor and
// the active workout both use it; the workout adds "Also change my routine".

export interface SupersetSheetItem {
  id: string;
  name: string;
  /** Current superset slot ("A1"), when the exercise is already in one. */
  badge?: string | null;
}

export interface SupersetSheetProps {
  open: boolean;
  onClose: () => void;
  items: readonly SupersetSheetItem[];
  /** Ticked when the sheet opens (e.g. the exercise whose menu opened it). */
  initialPicked?: readonly string[];
  /**
   * When given and true for the current picks, the "Also change my routine"
   * checkbox shows (default off). Its value is passed to `onGroup`.
   */
  routineOption?: (picked: readonly string[]) => boolean;
  onGroup: (picked: string[], alsoRoutine: boolean) => void;
}

export function SupersetSheet({
  open,
  onClose,
  items: liveItems,
  initialPicked,
  routineOption,
  onGroup,
}: SupersetSheetProps) {
  // Keep the last list while the sheet animates out (callers clear it on close).
  const lastItems = useRef(liveItems);
  if (open) lastItems.current = liveItems;
  const items = open ? liveItems : lastItems.current;
  const [picked, setPicked] = useState<string[]>([]);
  const [alsoRoutine, setAlsoRoutine] = useState(false);

  // Fresh picks every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setPicked([...(initialPicked ?? [])]);
    setAlsoRoutine(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only
  }, [open]);

  // Picks in list order (the order the superset will run in).
  const ordered = items.map((i) => i.id).filter((id) => picked.includes(id));
  const showRoutine = routineOption ? routineOption(ordered) : false;
  const ready = canGroupPicks(ordered);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Superset"
      description={SUPERSET_SHEET_HINT}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready}
            onClick={() => onGroup(ordered, showRoutine && alsoRoutine)}
            data-testid="superset-group"
          >
            Group as superset
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-3 pb-4" data-testid="superset-sheet">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const checked = picked.includes(item.id);
            const locked = isPickLocked(picked, item.id);
            return (
              <li key={item.id}>
                <label
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm',
                    checked ? 'bg-violet-50 text-violet-900' : 'text-gray-800 hover:bg-gray-100',
                    locked && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={() => setPicked((prev) => togglePick(prev, item.id))}
                    className="h-5 w-5 shrink-0 accent-violet-600"
                  />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.badge && (
                    <span className="shrink-0 rounded bg-violet-100 px-1.5 text-xs font-bold text-violet-700">
                      {item.badge}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        {showRoutine && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-2 text-sm text-gray-800">
            <input
              type="checkbox"
              checked={alsoRoutine}
              onChange={(e) => setAlsoRoutine(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-[#944a00]"
              data-testid="superset-also-routine"
            />
            <span className="min-w-0 flex-1">Also change my routine</span>
          </label>
        )}
      </div>
    </Sheet>
  );
}
