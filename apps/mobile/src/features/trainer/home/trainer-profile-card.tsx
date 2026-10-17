import { useState } from 'react';
import { Button, Text, useSnackbar } from '@chefer/ui-mobile';
import { userFacingErrorMessage } from '@chefer/utils';
import { trpc } from '../../../lib/trpc';
import { CoachingCard } from '../components/coaching-card';
import {
  profileInput,
  TrainerProfileFields,
  type TrainerProfileDraft,
} from '../components/trainer-profile-fields';

// The trainer's settings on Clients (PRD 2026-10 §4.1): the name clients see and the optional "Gym / city"
// line, saved with `trainer.updateProfile`. Starts from `trainer.status` (the gate already loaded it).

export const SAVE_LABEL = 'Save';
export const SAVED_LABEL = 'Saved';

export function TrainerProfileCard() {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const status = trpc.trainer.status.useQuery(undefined, { retry: false });
  const saved: TrainerProfileDraft = {
    displayName: status.data?.displayName ?? '',
    gymLine: status.data?.gymLine ?? '',
  };
  const [draft, setDraft] = useState<TrainerProfileDraft | null>(null);
  const value = draft ?? saved;
  const update = trpc.trainer.updateProfile.useMutation({
    meta: { silent: true },
    onSuccess: (next) => {
      utils.trainer.status.setData(undefined, next);
      setDraft(null);
      snackbar.show({ message: SAVED_LABEL });
    },
  });
  const input = profileInput(value);
  const changed =
    input.displayName !== saved.displayName.trim() ||
    (input.gymLine ?? '') !== saved.gymLine.trim();
  const save = () => {
    if (changed && input.displayName !== '' && !update.isPending) update.mutate(input);
  };

  if (!status.data) return null;
  return (
    <CoachingCard testID="trainer-profile">
      <TrainerProfileFields
        testID="trainer-profile"
        value={value}
        onChange={setDraft}
        onSubmit={save}
      />
      {update.error ? (
        <Text testID="trainer-profile-error" className="text-subhead text-danger">
          {userFacingErrorMessage(update.error)}
        </Text>
      ) : null}
      <Button
        testID="trainer-profile-save"
        variant="outline"
        loading={update.isPending}
        disabled={!changed || input.displayName === ''}
        onPress={save}
      >
        {SAVE_LABEL}
      </Button>
    </CoachingCard>
  );
}
