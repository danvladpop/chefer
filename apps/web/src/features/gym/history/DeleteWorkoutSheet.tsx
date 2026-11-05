'use client';

import { useRef } from 'react';
import { useT } from '@/lib/i18n';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { Button, Sheet } from '@chefer/ui';
import { deleteConfirmLines } from '../workout/session-corrections';

// The delete confirm (UX-44, T-44.5, AC4): names the workout, its sets and —
// only when they change — this week's count and the streak. Confirm hands off
// to `deleteSessionWithUndo` (8 s Undo toast); no window.confirm anywhere.

export function DeleteWorkoutSheet({
  session,
  bootstrap,
  onClose,
  onConfirm,
}: {
  session: SessionSummaryDto | null;
  bootstrap: Pick<GymBootstrap, 'weeks' | 'streak'> | undefined;
  onClose: () => void;
  onConfirm: (session: SessionSummaryDto) => void;
}) {
  const { t } = useT();
  // Keep the last session while the sheet animates out.
  const last = useRef<SessionSummaryDto | null>(null);
  if (session) last.current = session;
  const shown = session ?? last.current;

  return (
    <Sheet
      open={session !== null}
      onClose={onClose}
      title={t('gym.session.deleteTitle')}
      size="sm"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            variant="destructive"
            size="lg"
            className="w-full sm:w-auto"
            data-testid="gym-delete-confirm"
            onClick={() => session && onConfirm(session)}
          >
            {t('gym.session.deleteWorkout')}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
            data-testid="gym-delete-cancel"
            onClick={onClose}
          >
            {t('gym.workout.view.keepIt')}
          </Button>
        </div>
      }
    >
      <div className="space-y-1.5 px-5 pb-4 text-sm text-gray-700" data-testid="gym-delete-body">
        {shown
          ? deleteConfirmLines(shown, bootstrap, undefined, t).map((line) => (
              <p key={line}>{line}</p>
            ))
          : null}
      </div>
    </Sheet>
  );
}
