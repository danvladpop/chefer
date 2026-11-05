'use client';

import { useT } from '@/lib/i18n';
import type { BookingScope } from '@chefer/types';
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
  const { t } = useT();
  return (
    <div className="flex flex-col gap-2" data-testid="booking-scope-choice">
      <Button type="button" className="min-h-11" disabled={busy} onClick={() => onPick('THIS')}>
        {t('trainer.bookings.editor.thisOnly')}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={busy}
        onClick={() => onPick('FOLLOWING')}
      >
        {t('trainer.bookings.editor.following')}
      </Button>
      <Button type="button" variant="ghost" className="min-h-11" disabled={busy} onClick={onCancel}>
        {t('common.actions.cancel')}
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
  const { t } = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t('trainer.bookings.editor.scopeTitle')} size="sm">
      <div className="px-5 py-4">
        <ScopeChoice onPick={onPick} onCancel={onClose} busy={busy} />
      </div>
    </Sheet>
  );
}
