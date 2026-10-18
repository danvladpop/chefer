import {
  assignTemplateInputSchema,
  createTemplateInputSchema,
  listTemplatesInputSchema,
  saveTemplateInputSchema,
  templateIdInputSchema,
  updateTemplateClientsInputSchema,
} from '@chefer/types';
import { workoutTemplateService } from '../../application/coaching/workout-template.service.js';
import { trainerProcedure } from '../../lib/coaching-middleware.js';
import { assertWithinRateLimit } from '../../lib/rate-limit.js';
import { router } from '../../lib/trpc.js';

// ─── trainer.templates.* (docs/prd-2026-10/trainer-mode.md §6.6, §9; M2) ──────
// The trainer's workout templates. Every procedure is trainerProcedure: the
// templates are the trainer's own. assign / updateClients name clients; the
// service checks each one's ACTIVE link on its own (a per-client result, never
// one error for the whole call). Thin: handlers only delegate.

const DAY_MS = 24 * 60 * 60 * 1000;
/** New templates per trainer per day: far above real use (the library holds 200). */
const CREATES_PER_DAY = 100;

export const trainerTemplatesRouter = router({
  /** The library, most recently edited first. */
  list: trainerProcedure
    .input(listTemplatesInputSchema)
    .query(({ ctx }) => workoutTemplateService.list(ctx.user.id)),
  get: trainerProcedure
    .input(templateIdInputSchema)
    .query(({ ctx, input }) => workoutTemplateService.get(ctx.user.id, input.templateId)),
  create: trainerProcedure.input(createTemplateInputSchema).mutation(({ ctx, input }) => {
    assertWithinRateLimit('trainer.templates.create', ctx.user.id, CREATES_PER_DAY, DAY_MS);
    return workoutTemplateService.create(ctx.user.id, input);
  }),
  /** Autosave; a stale `expectedVersion` is CONFLICT with `data.conflict = { kind: 'template', current }`. */
  save: trainerProcedure
    .input(saveTemplateInputSchema)
    .mutation(({ ctx, input }) => workoutTemplateService.save(ctx.user.id, input)),
  delete: trainerProcedure
    .input(templateIdInputSchema)
    .mutation(({ ctx, input }) => workoutTemplateService.delete(ctx.user.id, input.templateId)),
  assign: trainerProcedure
    .input(assignTemplateInputSchema)
    .mutation(({ ctx, input }) => workoutTemplateService.assign(ctx.user.id, input)),
  updateClients: trainerProcedure
    .input(updateTemplateClientsInputSchema)
    .mutation(({ ctx, input }) => workoutTemplateService.updateClients(ctx.user.id, input)),
});
