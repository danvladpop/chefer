// Deload offers — research §1.6 (reactive for everyone, proactive after 6
// met weeks for intermediates; offered, never forced).
import type { ProgressionState, TrainingExperience, WeekSummary } from '@chefer/types';
import { notImplemented } from './_stub';

export function shouldOfferDeload(input: {
  states: ProgressionState[];
  weeks: WeekSummary[];
  experience: TrainingExperience;
  today: string;
  /** Monday of the week the user finished setup. */
  firstWeek: string;
}): { offer: boolean; reason: 'reactive' | 'proactive' | null } {
  return notImplemented(`shouldOfferDeload(${input.states.length}, ${input.experience})`);
}
