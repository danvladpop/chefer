import { useState, useSyncExternalStore } from 'react';
import { ConfirmSheet } from '@chefer/ui-mobile';
import { signOut } from '../../lib/sign-out';
import { trpc } from '../../lib/trpc';
import { activeSessionStore } from '../gym/offline/active-session-store';
import { outbox } from '../gym/offline/outbox';
import { unsyncedGymWorkoutCount } from '../gym/offline/unsynced';

// Sign-out from the More tab and Settings (UX-ACC-02, UX-ACC-12, UX-ACC-19).
// Both go through `signOut()` — the one place that empties the cache, the
// device state, the reminders and the drafts before the token goes — and both
// ask first: a plain "Sign out of Chefer?" confirm, or, when workouts exist
// only on this phone (signing out deletes them), the "Sign out anyway" sheet
// that says how many. Either way ONE confirm sheet, so a mis-tap never ends
// the session.

function subscribeUnsynced(listener: () => void): () => void {
  const stops = [outbox.subscribe(listener), activeSessionStore.subscribe(listener)];
  return () => stops.forEach((stop) => stop());
}

export function unsyncedWorkoutsText(count: number): string {
  return count === 1
    ? '1 workout hasn’t synced to your account yet. Signing out now deletes it from this phone.'
    : `${count} workouts haven’t synced to your account yet. Signing out now deletes them from this phone.`;
}

export function useSignOut(testID: string) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const unsynced = useSyncExternalStore(subscribeUnsynced, unsyncedGymWorkoutCount);
  const logout = trpc.auth.logout.useMutation({
    meta: { silent: true },
    // Even if the network call failed, drop the local session — the token may
    // already be dead server-side.
    onSettled: () => signOut({ reason: 'user' }),
  });

  /** Signs out now (the user has confirmed). */
  const proceed = () => {
    setConfirmOpen(false);
    logout.mutate();
  };
  /** Opens the confirm; nothing is signed out until the user agrees. */
  const request = () => setConfirmOpen(true);

  const confirmSheet = (
    <ConfirmSheet
      testID={testID}
      visible={confirmOpen}
      onClose={() => setConfirmOpen(false)}
      title={unsynced > 0 ? 'Sign out and lose workouts?' : 'Sign out of Chefer?'}
      body={unsynced > 0 ? unsyncedWorkoutsText(unsynced) : 'You can sign back in any time.'}
      confirmLabel={unsynced > 0 ? 'Sign out anyway' : 'Sign out'}
      cancelLabel={unsynced > 0 ? 'Stay signed in' : 'Cancel'}
      destructive
      onConfirm={proceed}
    />
  );

  return { request, proceed, unsynced, isPending: logout.isPending, confirmSheet };
}
