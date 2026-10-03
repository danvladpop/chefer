import { useQueryClient } from '@tanstack/react-query';
import type { GymBootstrap, GymProfileDto, SaveGymProfileInput } from '@chefer/types';
import { trpc } from '../../lib/trpc';
import { gymBootstrapQueryKey } from './use-gym-bootstrap';

// UX-GYM-22 (audit §6.3): gym settings save on every tap. Without an
// optimistic write, a stepper tapped twice offline (or before the first save
// returned) sent the SAME stale value twice, and a failed save left the screen
// claiming a value the server never got. This hook applies the change to the
// cached profile at once, rolls back just the fields it touched when the save
// fails, and replaces the profile with the server's copy on success. A failure
// reaches the user through the default mutation snackbar (no `silent` meta).

function changedKeys(input: SaveGymProfileInput): (keyof SaveGymProfileInput)[] {
  return (Object.keys(input) as (keyof SaveGymProfileInput)[]).filter(
    (key) => input[key] !== undefined,
  );
}

function withInput(profile: GymProfileDto, input: SaveGymProfileInput): GymProfileDto {
  const next: GymProfileDto = { ...profile };
  for (const key of changedKeys(input)) {
    // The input's keys are a subset of the profile's, with the same value types.
    Object.assign(next, { [key]: input[key] });
  }
  return next;
}

export function useSaveGymProfile(
  options: { onSaved?: (input: SaveGymProfileInput) => void } = {},
) {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  return trpc.gym.profile.save.useMutation({
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: gymBootstrapQueryKey });
      const previous =
        queryClient.getQueryData<GymBootstrap>(gymBootstrapQueryKey)?.profile ?? null;
      queryClient.setQueryData<GymBootstrap>(gymBootstrapQueryKey, (prev) =>
        prev?.profile ? { ...prev, profile: withInput(prev.profile, input) } : prev,
      );
      return { previous };
    },
    onError: (_error, input, context) => {
      const previous = context?.previous;
      if (!previous) return;
      // Roll back only the fields this save changed — another save may have
      // moved other fields since.
      queryClient.setQueryData<GymBootstrap>(gymBootstrapQueryKey, (prev) => {
        if (!prev?.profile) return prev;
        const restored: GymProfileDto = { ...prev.profile };
        for (const key of changedKeys(input)) Object.assign(restored, { [key]: previous[key] });
        return { ...prev, profile: restored };
      });
    },
    onSuccess: (profile, input) => {
      queryClient.setQueryData<GymBootstrap>(gymBootstrapQueryKey, (prev) =>
        prev ? { ...prev, profile } : prev,
      );
      // A kg/lb switch is also the global unit preference (P2-6).
      if (input.unit !== undefined) void utils.preferences.get.invalidate();
      options.onSaved?.(input);
    },
  });
}
