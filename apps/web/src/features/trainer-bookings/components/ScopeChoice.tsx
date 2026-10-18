'use client';

import { BOOKING_COPY, COACHING_COPY, type BookingScope } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';

/** "This booking / This and following" for a repeating booking (§6.2, §6.3). */
export function ScopeChoice({
  onPick,
  onCancel,
  busy = false,
}: {
  onPick: (scope: BookingScope) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const copy = BOOKING_COPY.editor;
  return (
    <div className="flex flex-col gap-2" data-testid="booking-scope-choice">
      <Button type="button" className="min-h-11" disabled={busy} onClick={() => onPick('THIS')}>
        {copy.thisOnly}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={busy}
        onClick={() => onPick('FOLLOWING')}
      >
        {copy.following}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onCancel}>
        {COACHING_COPY.common.cancel}
      </Button>
    </div>
  );
}

/** The scope question on its own (a dragged repeating booking). */
export function ScopeSheet({
  open,
  onPick,
  onClose,
  busy = false,
}: {
  open: boolean;
  onPick: (scope: BookingScope) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={BOOKING_COPY.editor.scopeTitle} size="sm">
      <div className="px-5 py-4">
        <ScopeChoice onPick={onPick} onCancel={onClose} busy={busy} />
      </div>
    </Sheet>
  );
}
