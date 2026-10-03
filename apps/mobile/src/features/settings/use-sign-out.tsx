import { useState, useSyncExternalStore } from 'react';
import { ConfirmSheet } from '@chefer/ui-mobile';
import { signOut } from '../../lib/sign-out';
import { trpc } from '../../lib/trpc';
import { activeSessionStore } from '../gym/offline/active-session-store';
import { outbox } from '../gym/offline/outbox';
import { unsyncedGymWorkoutCount } from '../gym/offline/unsynced';

// Sign-out from the More tab and Settings (UX-ACC-02, UX-ACC-12). Both go
// through `signOut()` — the one place that empties the cache, the device
// state, the reminders and the drafts before the token goes — and both warn
// first when workouts exist only on this phone: signing out deletes them.

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
  const [warnOpen, setWarnOpen] = useState(false);
  const unsynced = useSyncExternalStore(subscribeUnsynced, unsyncedGymWorkoutCount);
  const logout = trpc.auth.logout.useMutation({
    meta: { silent: true },
    // Even if the network call failed, drop the local session — the token may
    // already be dead server-side.
    onSettled: () => signOut({ reason: 'user' }),
  });

  /** Signs out now (the caller has already confirmed, or there is nothing to lose). */
  const proceed = () => {
    setWarnOpen(false);
    logout.mutate();
  };
  /** Signs out, or first warns that unsynced workouts would be lost. */
  const request = () => {
    if (unsynced > 0) setWarnOpen(true);
    else proceed();
  };

  const warningSheet = (
    <ConfirmSheet
      testID={testID}
      visible={warnOpen}
      onClose={() => setWarnOpen(false)}
      title="Sign out and lose workouts?"
      body={unsyncedWorkoutsText(unsynced)}
      confirmLabel="Sign out anyway"
      cancelLabel="Stay signed in"
      destructive
      onConfirm={proceed}
    />
  );

  return { request, proceed, unsynced, isPending: logout.isPending, warningSheet };
}
