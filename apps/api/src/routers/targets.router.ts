import { z } from 'zod';
import { targetsService } from '../application/targets/targets.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// ─── Targets router (§2.11, T-35.1, T-11.1) ────────────────────────────────────
// `get`/`set` implement the own-target override; `changes`/`acknowledgeChange`
// implement the "never change your targets silently" change log. Every input
// is optional-additive and every output is additive-only (installed app-store
// clients keep working): `myUnresolvedChanges` (wave-0 stub) stays as an
// alias of `changes`.

const setInputSchema = z.object({
  targetMode: z.enum(['OWN', 'SUGGESTED']),
  kcal: z.number().int().min(1200).max(5000).optional(),
  proteinG: z.number().int().min(40).max(400).optional(),
  carbsG: z.number().int().min(0).max(1000).optional(),
  fatG: z.number().int().min(0).max(500).optional(),
  trainingKcal: z.number().int().min(1200).max(6000).optional(),
  trainingProteinG: z.number().int().min(40).max(500).optional(),
  addTrainingBonus: z.boolean().optional(),
});

export const targetsRouter = router({
  /**
   * The resolved view for the signed-in user: `effective` (what every other
   * screen must show), `suggested`, `source` and `inputs` (for the Explain
   * sheet), plus the raw own-target state. Detects and records a silent
   * change as a side effect (§2.11).
   */
  get: protectedProcedure.query(({ ctx }) => targetsService.get(ctx.user.id)),

  /** Sets (or clears) the user's own target override. See T-35.1 AC4 for bounds. */
  set: protectedProcedure.input(setInputSchema).mutation(({ ctx, input }) => {
    return targetsService.set(ctx.user.id, ctx.user, input);
  }),

  /** This user's unresolved target changes — newest first. */
  changes: protectedProcedure.query(({ ctx }) => targetsService.changes(ctx.user.id)),

  /** `keep: true` = "Keep mine"; `keep: false` = "Use {n}" / accept the new value. */
  acknowledgeChange: protectedProcedure
    .input(z.object({ id: z.string().min(1), keep: z.boolean() }))
    .mutation(({ ctx, input }) => targetsService.acknowledgeChange(ctx.user.id, input)),

  /** @deprecated wave-0 stub name — alias of `changes`, kept for old clients. */
  myUnresolvedChanges: protectedProcedure.query(({ ctx }) =>
    targetsService.listMyUnresolvedChanges(ctx.user.id),
  ),
});
