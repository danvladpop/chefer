import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { GymBootstrap, WorkoutSessionDoc } from '@chefer/types';
import { useActiveSessionPausedAt } from '../offline/active-session-store';
import {
  dispatchWorkout,
  getResumableSession,
  useActiveWorkout,
  type DispatchOptions,
  type WorkoutActionInput,
} from '../use-active-workout';
import { useGymBootstrap } from '../use-gym-bootstrap';

// ─── Which workout the logger runs (trainer mode M3, trainer-mode.md §6.7) ────
// The workout screen is ONE logger. By default it runs the signed-in user's own
// active session (use-active-workout). The coached logger wraps it in a
// WorkoutSourceProvider that points it at a client's workout instead: the
// client's prescription, units and exercise meta, its own persisted record and
// outbox, and a few chrome overrides ("Coaching Maria", the client switcher,
// where Finish goes). Nothing here changes the owner's path.

/** What a coached workout changes about the logger's chrome. */
export interface CoachedWorkoutChrome {
  /** Header title: "Coaching Maria". */
  title: string;
  /** Rendered right under the header (a group booking's client switcher). */
  accessory?: ReactNode;
  /** Replaces Finish's own flow (group: "Finish Maria's workout" / "Finish everyone"). */
  onFinishPress?: () => void;
  /** After this client's workout finished — instead of the summary screen. */
  onFinished: (doc: WorkoutSessionDoc) => void;
  /** Minimise / leave the logger (the workout keeps going). */
  onLeave: () => void;
}

export interface WorkoutSource {
  /** The in-progress workout (null when none). */
  session: WorkoutSessionDoc | null;
  /** "Save for later" instant, or null. */
  pausedAt: string | null;
  /** What the logger reads units, library, history and progressions from. */
  bootstrap: GymBootstrap | undefined;
  /** The LIVE doc — stable function; handlers read through it instead of closing over a doc. */
  get: () => WorkoutSessionDoc | null;
  /** Reducer + persistence + rest timer — stable function. */
  dispatch: (action: WorkoutActionInput, options?: DispatchOptions) => WorkoutSessionDoc | null;
  finish: (carryOverExerciseIds?: string[]) => Promise<WorkoutSessionDoc | null>;
  discard: () => WorkoutSessionDoc | null;
  saveForLater: () => void;
  resume: () => void;
  /** Null for the user's own workout; set when a trainer coaches a client. */
  coached: CoachedWorkoutChrome | null;
}

const WorkoutSourceContext = createContext<WorkoutSource | null>(null);

/** Points the workout screen below at another workout (the coached logger). */
export const WorkoutSourceProvider = WorkoutSourceContext.Provider;

// Late-bound through the module (not captured): tests spy on these exports.
const ownerGet = (): WorkoutSessionDoc | null => getResumableSession();
const ownerDispatch = (action: WorkoutActionInput, options?: DispatchOptions) =>
  dispatchWorkout(action, options);

function useOwnerWorkoutSource(): WorkoutSource {
  const { session, finish, discard, saveForLater, resume } = useActiveWorkout();
  const pausedAt = useActiveSessionPausedAt();
  const { data: bootstrap } = useGymBootstrap();
  return useMemo(
    () => ({
      session,
      pausedAt,
      bootstrap,
      get: ownerGet,
      dispatch: ownerDispatch,
      finish,
      discard,
      saveForLater,
      resume,
      coached: null,
    }),
    [session, pausedAt, bootstrap, finish, discard, saveForLater, resume],
  );
}

/** The workout the logger runs: a provided (coached) one, else the user's own. */
export function useWorkoutSource(): WorkoutSource {
  const provided = useContext(WorkoutSourceContext);
  const owner = useOwnerWorkoutSource();
  return provided ?? owner;
}
