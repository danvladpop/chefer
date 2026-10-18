import type { trpc } from '../../lib/trpc';
import { coachedOutboxes } from './coached-outbox';

// Wires the coached outboxes to tRPC (mounted by GymSyncProvider next to the
// owner's outbox, while signed in): `trainer.coach.sync` per client, and the
// trainer's views that a coached workout changes are refreshed once acked.

type TrpcUtils = ReturnType<typeof trpc.useUtils>;

/** What a coached workout changes on the trainer's side (attendance, delivered counts, the client's history). */
export function invalidateAfterCoaching(utils: TrpcUtils, clientId: string): void {
  void utils.trainer.bookings.invalidate();
  void utils.trainer.dashboard.summary.invalidate();
  void utils.trainer.badges.invalidate();
  void utils.trainer.client.workouts.invalidate({ clientId });
  void utils.trainer.client.overview.invalidate({ clientId });
  void utils.trainer.client.bookings.invalidate({ clientId });
}

/** Configures the coached outboxes' sender and starts their flush triggers. Returns stop. */
export function startCoachedSync(utils: TrpcUtils): () => void {
  coachedOutboxes.configure({
    send: async (clientId, docs) =>
      (await utils.client.trainer.coach.sync.mutate({ clientId, docs })).results,
    onSynced: (clientId) => invalidateAfterCoaching(utils, clientId),
  });
  const stop = coachedOutboxes.start();
  return () => {
    coachedOutboxes.configure(null);
    stop();
  };
}
