'use client';

import { useEffect, useState } from 'react';
import { trackSharingChanged } from '@/lib/analytics-events';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import {
  COACHING_SHARING_COPY,
  type CoachingShareChoice,
  type CoachingSharingDto,
} from '@chefer/types';
import { SharingSwitches } from './SharingSwitches';

// ─── Your trainer → "What you share with Ana" (lane K1) ────────────────────────
// Optimistic: the switch flips at once and rolls back if the save fails. A
// revoke is effective on the trainer's next request. Mirrors mobile's
// features/coaching/sharing/sharing-card.tsx.

const toChoice = (s: CoachingSharingDto | undefined): CoachingShareChoice => ({
  food: s?.food ?? false,
  weight: s?.weight ?? false,
});

export function SharingCard({
  trainerName,
  sharing,
}: {
  trainerName: string;
  sharing: CoachingSharingDto | undefined;
}) {
  const utils = trpc.useUtils();
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
      showAppToast({
        message: on ? copy.on(trainerName) : copy.off(trainerName),
        type: 'success',
      });
    },
    onError: () => {
      setValue(toChoice(sharing));
      showAppToast({ message: COACHING_SHARING_COPY.saveError });
    },
    onSettled: () => void utils.coaching.status.invalidate(),
  });
  return (
    <div className="flex flex-col gap-3" data-testid="your-trainer-sharing">
      <h3 className="text-sm font-semibold text-gray-900">
        {COACHING_SHARING_COPY.settingsHeading(trainerName)}
      </h3>
      <SharingSwitches
        testId="your-trainer-share"
        trainerName={trainerName}
        value={value}
        disabled={save.isPending}
        onChange={(change) => {
          setValue((cur) => ({ ...cur, ...change }));
          save.mutate({ ...change, source: 'web' });
        }}
      />
    </div>
  );
}
