import { useEffect, useState } from 'react';
import {
  COACHING_SHARING_COPY,
  type CoachingShareChoice,
  type CoachingSharingDto,
} from '@chefer/types';
import { Text, useSnackbar } from '@chefer/ui-mobile';
import { trackSharingChanged } from '../../../lib/analytics-events';
import { trpc } from '../../../lib/trpc';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { SharingSwitches } from './sharing-switches';

// ─── Your trainer → "What you share with Ana" (lane K1) ────────────────────────
// The client's food / weight switches for the active coaching. Optimistic: the switch flips at once
// and rolls back if the save fails. A revoke is effective on the trainer's next request. Mirrors the
// web card (apps/web/src/features/coaching/components/SharingCard.tsx).

const toChoice = (s: CoachingSharingDto | undefined): CoachingShareChoice => ({
  food: s?.food ?? false,
  weight: s?.weight ?? false,
});

export function SharingCard({
  trainerName,
  sharing,
}: {
  trainerName: string;
  /** `coaching.status.trainer.sharing`; absent from an older API = both off. */
  sharing: CoachingSharingDto | undefined;
}) {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const [value, setValue] = useState<CoachingShareChoice>(() => toChoice(sharing));
  useEffect(() => setValue(toChoice(sharing)), [sharing]);
  const save = trpc.coaching.setSharing.useMutation({
    meta: { silent: true },
    onSuccess: (next, vars) => {
      setValue(toChoice(next));
      trackSharingChanged(vars, 'settings');
      const copy =
        vars.food !== undefined ? COACHING_SHARING_COPY.food : COACHING_SHARING_COPY.weight;
      const on = vars.food ?? vars.weight ?? false;
      snackbar.show({ message: on ? copy.on(trainerName) : copy.off(trainerName) });
    },
    onError: () => setValue(toChoice(sharing)),
    onSettled: () => void utils.coaching.status.invalidate(),
  });

  return (
    <CoachingCard testID="your-trainer-sharing" className="gap-3">
      <Text accessibilityRole="header" className="text-headline font-semibold text-label">
        {COACHING_SHARING_COPY.settingsHeading(trainerName)}
      </Text>
      <SharingSwitches
        testID="your-trainer-share"
        trainerName={trainerName}
        value={value}
        disabled={save.isPending}
        onChange={(change) => {
          setValue((cur) => ({ ...cur, ...change }));
          save.mutate(change);
        }}
      />
      {save.isError ? (
        <Text testID="your-trainer-sharing-error" className="text-subhead text-danger">
          {COACHING_SHARING_COPY.saveError}
        </Text>
      ) : null}
    </CoachingCard>
  );
}
