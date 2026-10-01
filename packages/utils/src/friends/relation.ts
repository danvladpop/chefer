import type { Relation } from '@chefer/types';

/** My outgoing follow edge to the person: none, a pending request, or accepted. */
export type OutgoingFollowStatus = 'PENDING' | 'ACCEPTED' | null | undefined;

/** The viewer → person relation the UI renders on the relation button. */
export function relationOf({
  isSelf,
  outgoing,
}: {
  isSelf: boolean;
  outgoing: OutgoingFollowStatus;
}): Relation {
  if (isSelf) return 'self';
  if (outgoing === 'ACCEPTED') return 'following';
  if (outgoing === 'PENDING') return 'requested';
  return 'none';
}
