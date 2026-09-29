'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import type { GymBootstrap, SessionSummaryDto } from '@chefer/types';
import { deleteSessionWithUndo, type DeleteSource } from '../workout/session-corrections';
import { DeleteWorkoutSheet } from './DeleteWorkoutSheet';

/**
 * `ask(session)` opens the named confirm; confirming deletes with the 8 s Undo
 * toast (T-44.5). Render `sheet` once per page.
 */
export function useDeleteWorkout(input: {
  bootstrap: GymBootstrap | undefined;
  source: DeleteSource;
  /** After the delete was confirmed (the detail page leaves itself). */
  onDeleted?: () => void;
}) {
  const { bootstrap, source, onDeleted } = input;
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<SessionSummaryDto | null>(null);

  const sheet = (
    <DeleteWorkoutSheet
      session={pending}
      bootstrap={bootstrap}
      onClose={() => setPending(null)}
      onConfirm={(session) => {
        setPending(null);
        void deleteSessionWithUndo({
          utils,
          session,
          engineVersion: bootstrap?.engineVersion ?? 1,
          source,
        });
        onDeleted?.();
      }}
    />
  );

  return { ask: setPending, sheet };
}
