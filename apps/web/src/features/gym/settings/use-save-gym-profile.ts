'use client';

import { trpc } from '@/lib/trpc';
import type { GymBootstrap, GymProfileDto, SaveGymProfileInput } from '@chefer/types';
import { userFacingErrorMessage } from '@chefer/utils';
import { showGymToast } from '../shared/gym-toast';
import { localDate } from '../use-gym-bootstrap';

// UX-GYM-22 (audit §6.3), the web twin of the phone's `useSaveGymProfile`: a
// settings save used to leave the screen showing the OLD value until the
// refetch landed (a stepper tapped twice sent the same stale value twice), and
// a failed save left no trace of what the screen claimed. This hook writes the
// change to the cached profile at once, rolls back just the fields it touched
// when the save fails, and replaces the profile with the server's copy on
// success. The caller shows the failure (`meta: { silent: true }`).

type InputKey = keyof SaveGymProfileInput;

function changedKeys(input: SaveGymProfileInput): InputKey[] {
  return (Object.keys(input) as InputKey[]).filter((key) => input[key] !== undefined);
}

/** `profile` with the fields `input` sets applied (pure). */
export function applyProfileInput(
  profile: GymProfileDto,
  input: SaveGymProfileInput,
): GymProfileDto {
  const next: GymProfileDto = { ...profile };
  for (const key of changedKeys(input)) {
    // The input's keys are a subset of the profile's, with the same value types.
    Object.assign(next, { [key]: input[key] });
  }
  return next;
}

/**
 * `current` with only the fields `input` changed put back from `previous`
 * (pure) — another save may have moved other fields since, so those stay.
 */
export function revertProfileInput(
  current: GymProfileDto,
  previous: GymProfileDto,
  input: SaveGymProfileInput,
): GymProfileDto {
  const restored: GymProfileDto = { ...current };
  for (const key of changedKeys(input)) Object.assign(restored, { [key]: previous[key] });
  return restored;
}

export function useSaveGymProfile(
  options: { onSaved?: (input: SaveGymProfileInput) => void } = {},
) {
  const utils = trpc.useUtils();

  return trpc.gym.profile.save.useMutation({
    meta: { silent: true },
    onMutate: async (input) => {
      const key = { today: localDate() };
      await utils.gym.bootstrap.cancel(key);
      const previous = utils.gym.bootstrap.getData(key)?.profile ?? null;
      utils.gym.bootstrap.setData(key, (prev: GymBootstrap | undefined) =>
        prev?.profile ? { ...prev, profile: applyProfileInput(prev.profile, input) } : prev,
      );
      return { previous, key };
    },
    onError: (error, input, context) => {
      // A kg/lb switch re-keys the settings card, so its inline error would be
      // gone with it — say so in the gym toast, which outlives the card.
      if (input.unit !== undefined) {
        showGymToast({ message: userFacingErrorMessage(error), type: 'error' });
      }
      if (!context?.previous) return;
      const { previous, key } = context;
      utils.gym.bootstrap.setData(key, (prev: GymBootstrap | undefined) =>
        prev?.profile
          ? { ...prev, profile: revertProfileInput(prev.profile, previous, input) }
          : prev,
      );
    },
    onSuccess: (profile, input, context) => {
      if (context) {
        utils.gym.bootstrap.setData(context.key, (prev: GymBootstrap | undefined) =>
          prev ? { ...prev, profile } : prev,
        );
      }
      // Weights and targets derive from the profile — refresh what the server computed.
      void utils.gym.bootstrap.invalidate();
      // A kg/lb switch is also the global unit preference (P2-6).
      if (input.unit !== undefined) void utils.preferences.get.invalidate();
      options.onSaved?.(input);
    },
  });
}
