import { useRef, useState } from 'react';
import type { Translator } from '@chefer/i18n';
import { ConfirmSheet } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { getTranslator, useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';

// "Turn off trainer tools" (PRD 2026-10 §4.3): one confirmation that names the client count first, then
// `trainer.deactivate`. Shared by Trainer tools (/trainer) and trainer mode's You tab, which also leaves
// trainer mode afterwards (`onTurnedOff`).

/** The confirmation's body: the client count first, then what turning off means. */
export function turnOffBody(activeClients: number, t: Translator['t'] = getTranslator().t): string {
  return activeClients > 0
    ? `${t('coaching.trainer.profile.turnOffWithClients', { count: activeClients })} ${t('coaching.trainer.turnOffBody')}`
    : t('coaching.trainer.turnOffBody');
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
  const { t } = useT();
  const utils = trpc.useUtils();
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  const [open, setOpen] = useState(false);
  const onTurnedOffRef = useRef(onTurnedOff);
  onTurnedOffRef.current = onTurnedOff;
  const body = turnOffBody(status.data?.activeClients ?? fallbackClients, t);
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
      title={t('coaching.trainer.turnOff')}
      body={body}
      confirmLabel={t('coaching.trainer.turnOff')}
      cancelLabel={t('coaching.common.cancel')}
      destructive
      busy={deactivate.isPending}
      error={deactivate.error ? userFacingErrorMessage(deactivate.error) : null}
      onConfirm={() => deactivate.mutate()}
    />
  );
  return { body, request: () => setOpen(true), sheet };
}
