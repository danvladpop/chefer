import type { ProfileVisibility } from '@chefer/types';

/**
 * What following a profile does (Instagram model, PRD Q-F-1): a PUBLIC profile
 * is followed instantly, a PRIVATE one receives a request its owner accepts.
 * A forced-private profile is PRIVATE here too (moderation stores PRIVATE).
 */
export function followOutcome(targetVisibility: ProfileVisibility): 'instant' | 'request' {
  return targetVisibility === 'PUBLIC' ? 'instant' : 'request';
}
