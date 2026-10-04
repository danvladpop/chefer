import { mergeRouters, router } from '../../lib/trpc.js';
import { trainerClientRouter } from './client.router.js';
import { trainerProfileRouter } from './profile.router.js';

// trainer.* tRPC namespace (docs/trainer-platform/spec.md §7.2): the trainer
// side of coaching. Dark behind the `coaching` flag / COACHING_ALLOWLIST. Thin
// routers only — every handler calls a service in application/coaching/.
// (`coach.*` is Adaptive Chef's weekly review: a different feature.)
export const trainerRouter = mergeRouters(
  trainerProfileRouter,
  router({ client: trainerClientRouter }),
);
