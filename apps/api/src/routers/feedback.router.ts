import { z } from 'zod';
import { feedbackService } from '../application/feedback/feedback.service.js';
import { protectedProcedure, router } from '../lib/trpc.js';

const submitFeedbackSchema = z.object({
  message: z.string().min(1).max(2000),
  path: z.string().max(200).optional(),
});

export const feedbackRouter = router({
  submit: protectedProcedure.input(submitFeedbackSchema).mutation(({ ctx, input }) => {
    return feedbackService.submit(ctx.user.id, input.message, input.path ?? null);
  }),
});
