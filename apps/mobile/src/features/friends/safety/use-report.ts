import { useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { reportInputSchema } from '@chefer/types';
import { trpc } from '../../../lib/trpc';
import { invalidateAfterBlock } from '../api/invalidate';
import { removePerson } from '../api/relation-cache';
import type { SafetyResult } from './use-block';

// ─── Following: report (and block) (UX §11.4, PRD §9) ─────────────────────────
// `friends.report` ALWAYS also blocks, server-side, in the same call. Like a
// block it isn't optimistic: nothing changes on screen until the server
// confirms. Then the person leaves every cached people list and the
// namespace + recipe lists refetch.

export type ReportInput = z.infer<typeof reportInputSchema>;

export function useReport(): {
  report: (input: ReportInput) => Promise<SafetyResult>;
  isPending: boolean;
} {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();
  const mutation = trpc.friends.report.useMutation();
  return {
    report: async (input) => {
      try {
        await mutation.mutateAsync(input);
      } catch (error) {
        return { ok: false, error };
      }
      removePerson(queryClient, input.userId);
      invalidateAfterBlock(utils);
      if (input.recipeId) void utils.mealPlan.getRecipe.invalidate({ recipeId: input.recipeId });
      return { ok: true };
    },
    isPending: mutation.isPending,
  };
}
