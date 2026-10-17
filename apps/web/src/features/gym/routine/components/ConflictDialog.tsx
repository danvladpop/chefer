'use client';

import { COACHING_COPY } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';

export interface ConflictDialogProps {
  open: boolean;
  onKeepMine: () => void;
  onUseTheirs: () => void;
  saving?: boolean;
  /**
   * Trainer coaching (API level 6+): who changed the routine while you were
   * editing ("Ana", the trainer's side: the client). Absent = the generic copy.
   */
  changedBy?: string | null;
}

/** gym_plan.md §5.4: routine save CONFLICT — the routine changed elsewhere. */
export function ConflictDialog({
  open,
  onKeepMine,
  onUseTheirs,
  saving = false,
  changedBy = null,
}: ConflictDialogProps) {
  if (!open) return null;

  return (
    <Sheet
      open={open}
      onClose={onUseTheirs}
      title={
        changedBy ? COACHING_COPY.stamps.conflict(changedBy) : 'This routine changed elsewhere'
      }
      hideHeader={false}
      size="sm"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onUseTheirs} disabled={saving}>
            Use the other version
          </Button>
          <Button type="button" onClick={onKeepMine} loading={saving}>
            Keep mine
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4 text-sm text-gray-600">
        <p>
          {changedBy
            ? `${changedBy} saved a different version since you opened it. `
            : 'It looks like this routine was edited on another device since you opened it. '}
          You can keep your changes and overwrite the other version, or discard yours and load the
          other version instead.
        </p>
      </div>
    </Sheet>
  );
}
