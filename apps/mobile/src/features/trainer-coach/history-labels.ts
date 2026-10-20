import { BOOKING_COPY, type CoachedWorkoutDto, type SessionSummaryDto } from '@chefer/types';

// "Logged by" labels (trainer-mode.md §6.5, §6.7): a coached workout reads "Logged by Ana" in the
// client's own history, and "Logged by you" on the trainer's client Workouts tab. Absent fields (an
// older server, a workout the person logged themselves) → no label.

/** The client's history: "Logged by Ana", or null for their own workouts. */
export function loggedByLabel(session: Pick<SessionSummaryDto, 'loggedBy'> | null | undefined) {
  return session?.loggedBy ? BOOKING_COPY.coach.loggedBy(session.loggedBy.name) : null;
}

/** The trainer's client Workouts tab: "Logged by you", or null. */
export function loggedByYouLabel(workout: Pick<CoachedWorkoutDto, 'loggedByTrainer'>) {
  return workout.loggedByTrainer ? BOOKING_COPY.coach.loggedByYou : null;
}
