import { z } from 'zod';
import { feedbackService } from '../application/feedback/feedback.instance.js';
import { protectedProcedure, router } from '../lib/trpc.js';

// `build` / `os` / `route` are additive and optional (UX-PO-05): shipped 1.0.1
// binaries send only `message` + `path`.
const submitFeedbackSchema = z.object({
  message: z.string().min(1).max(2000),
  path: z.string().max(200).optional(),
  build: z.string().max(160).optional(),
  os: z.string().max(60).optional(),
  route: z.string().max(200).optional(),
});

export const feedbackRouter = router({
  submit: protectedProcedure.input(submitFeedbackSchema).mutation(({ ctx, input }) => {
    return feedbackService.submit(
      ctx.user.id,
      input.message,
      input.path ?? null,
      { build: input.build, os: input.os, route: input.route },
      { email: ctx.user.email },
    );
  }),
});
