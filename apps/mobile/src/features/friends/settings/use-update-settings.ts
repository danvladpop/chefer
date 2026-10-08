import { useRef } from 'react';
import type { FriendsMeDto } from '@chefer/types';
import { haptics } from '@chefer/ui-mobile';
import { trpc, type RouterInputs, type RouterOutputs } from '../../../lib/trpc';

// ─── Following: `friends.updateSettings` (UX §11.1, MO-08) ─────────────────────
// One writer for the Sharing & privacy screen. The sharing switches are
// OPTIMISTIC: the `friends.me` cache flips at once (instant flip + selection
// haptic, MO-08), and on error ONLY the keys this call changed are put back
// (never the whole object — a second switch flipped meanwhile must survive),
// with the error haptic. Visibility, targets and the name are NOT optimistic:
// they sit behind a confirm sheet or an inline error that waits for the server.
// `friends.me` is refetched once the last in-flight save settles, so a
// refetch never lands between two optimistic writes and undoes the first.

export type UpdateSettingsInput = RouterInputs['friends']['updateSettings'];
export type UpdateSettingsResult = RouterOutputs['friends']['updateSettings'];

type SettingsKey = 'visibility' | 'sharePlan' | 'shareRecipes' | 'shareWorkouts' | 'shareTargets';
const SETTINGS_KEYS: readonly SettingsKey[] = [
  'visibility',
  'sharePlan',
  'shareRecipes',
  'shareWorkouts',
  'shareTargets',
];

export type SaveResult = { ok: true; result: UpdateSettingsResult } | { ok: false; error: unknown };

type Settings = NonNullable<FriendsMeDto['settings']>;

function patchSettings(
  me: FriendsMeDto | undefined,
  patch: Partial<Settings>,
): FriendsMeDto | undefined {
  if (!me?.settings) return me;
  return { ...me, settings: { ...me.settings, ...patch } };
}

export function useUpdateSettings(): {
  save: (input: UpdateSettingsInput, options?: { optimistic?: boolean }) => Promise<SaveResult>;
} {
  const utils = trpc.useUtils();
  const mutation = trpc.friends.updateSettings.useMutation({ meta: { silent: true } });
  const inflight = useRef(0);

  const save = async (
    input: UpdateSettingsInput,
    { optimistic = false }: { optimistic?: boolean } = {},
  ): Promise<SaveResult> => {
    inflight.current += 1;
    // The keys of `me.settings` this save touches, and what they were before.
    const touched = SETTINGS_KEYS.filter((key) => input[key] !== undefined);
    const previous: Partial<Settings> = {};
    const next: Partial<Settings> = {};
    if (optimistic) {
      await utils.friends.me.cancel();
      const before = utils.friends.me.getData()?.settings;
      for (const key of touched) {
        Object.assign(previous, before ? { [key]: before[key] } : {});
        Object.assign(next, { [key]: input[key] });
      }
      utils.friends.me.setData(undefined, (me) => patchSettings(me, next));
      haptics.selection();
    }
    try {
      const result = await mutation.mutateAsync(input);
      return { ok: true, result };
    } catch (error) {
      if (optimistic) {
        utils.friends.me.setData(undefined, (me) => patchSettings(me, previous));
        haptics.error();
      }
      return { ok: false, error };
    } finally {
      inflight.current -= 1;
      if (inflight.current === 0) void utils.friends.me.invalidate();
    }
  };

  return { save };
}
