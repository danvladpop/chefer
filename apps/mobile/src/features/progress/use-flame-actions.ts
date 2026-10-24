import { localDateStr } from '@chefer/utils';
import { trpc } from '../../lib/trpc';

// The Flame's three writes (mockups 05 and 12): the weekly goal, a pause of up
// to four weeks, and "I'm back". Each refreshes the summary (and so Today's
// strip) when it lands; a failure shows the app's default snackbar.

export interface FlameActions {
  setGoal: (goal: number) => void;
  pause: (weeks: number) => void;
  resume: () => void;
  pending: boolean;
}

export function useFlameActions(): FlameActions {
  const utils = trpc.useUtils();
  const refresh = () => void utils.progress.summary.invalidate();
  const setGoal = trpc.progress.setActiveDayGoal.useMutation({ onSuccess: refresh });
  const pause = trpc.progress.pauseFlame.useMutation({ onSuccess: refresh });
  const resume = trpc.progress.resumeFlame.useMutation({ onSuccess: refresh });
  return {
    setGoal: (goal) => setGoal.mutate({ goal, localDate: localDateStr() }),
    pause: (weeks) => pause.mutate({ startDate: localDateStr(), weeks }),
    resume: () => resume.mutate({ localDate: localDateStr() }),
    pending: setGoal.isPending || pause.isPending || resume.isPending,
  };
}
