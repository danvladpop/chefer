import { useRef, useState } from 'react';
import { COACHING_COPY } from '@chefer/types';
import { ConfirmSheet } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';

// "Turn off trainer tools" (PRD 2026-10 §4.3): one confirmation that names the client count first, then
// `trainer.deactivate`. Shared by Trainer tools (/trainer) and trainer mode's You tab, which also leaves
// trainer mode afterwards (`onTurnedOff`).

/** The confirmation's body: the client count first, then what turning off means. */
export function turnOffBody(activeClients: number): string {
  return activeClients > 0
    ? `${COACHING_COPY.trainerProfile.turnOffWithClients(activeClients)} ${COACHING_COPY.trainer.turnOffBody}`
    : COACHING_COPY.trainer.turnOffBody;
}

export function useTurnOffTrainerTools({
  testID,
  fallbackClients = 0,
  onTurnedOff,
}: {
  testID: string;
  /** Used while `trainer.status` has no `activeClients` (an older API). */
  fallbackClients?: number;
  onTurnedOff?: () => void;
}) {
  const utils = trpc.useUtils();
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  const [open, setOpen] = useState(false);
  const onTurnedOffRef = useRef(onTurnedOff);
  onTurnedOffRef.current = onTurnedOff;
  const body = turnOffBody(status.data?.activeClients ?? fallbackClients);
  const deactivate = trpc.trainer.deactivate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      setOpen(false);
      void utils.trainer.status.invalidate();
      void utils.trainer.clients.list.invalidate();
      void utils.trainer.requests.list.invalidate();
      onTurnedOffRef.current?.();
    },
  });

  const sheet = (
    <ConfirmSheet
      testID={testID}
      visible={open}
      onClose={() => setOpen(false)}
      title={COACHING_COPY.trainer.turnOff}
      body={body}
      confirmLabel={COACHING_COPY.trainer.turnOff}
      cancelLabel={COACHING_COPY.common.cancel}
      destructive
      busy={deactivate.isPending}
      error={deactivate.error ? userFacingErrorMessage(deactivate.error) : null}
      onConfirm={() => deactivate.mutate()}
    />
  );
  return { body, request: () => setOpen(true), sheet };
}
