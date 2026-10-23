import type { ProgressSettings, ProgressSettingsPatch } from '@chefer/types';
import { localDateStr, progressSettingsEvents } from '@chefer/utils';
import { track } from '../../lib/analytics';
import { trpc } from '../../lib/trpc';

// Rewards & motivation writes (mockup 12). A switch must not snap back while
// the request is in flight, so the change is written into the cached summary
// first, rolled back if the API refuses, and the summary is re-read when it
// settles.

/** The settings with a patch applied (the reminder merges field by field). */
export function applySettingsPatch(
  settings: ProgressSettings,
  patch: ProgressSettingsPatch,
): ProgressSettings {
  const { reminder, ...rest } = patch;
  return {
    ...settings,
    ...rest,
    reminder: { ...settings.reminder, ...reminder },
  };
}

export function useUpdateProgressSettings() {
  const utils = trpc.useUtils();
  const mutation = trpc.progress.updateSettings.useMutation({
    onMutate: async (patch) => {
      const input = { localDate: localDateStr() };
      await utils.progress.summary.cancel(input);
      const previous = utils.progress.summary.getData(input);
      if (previous) {
        utils.progress.summary.setData(input, {
          ...previous,
          settings: applySettingsPatch(previous.settings, patch),
        });
      }
      return { input, previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) utils.progress.summary.setData(context.input, context.previous);
    },
    onSettled: () => void utils.progress.summary.invalidate(),
  });
  return {
    update: (patch: ProgressSettingsPatch) => {
      for (const e of progressSettingsEvents(patch)) track(e.name, e.props);
      mutation.mutate(patch);
    },
    pending: mutation.isPending,
  };
}
