import { z } from 'zod';

// ─── Safety checks payload (§2.1, §2.2) ───────────────────────────────────────
// Shared shapes for the one safety filter (T-01.1+). `who` is a member name
// or 'you' (the owner). Additive/optional everywhere they attach to an
// existing procedure (§2.2), so old clients ignore fields they don't render.

export const safetyCheckedItemSchema = z.object({
  label: z.string(),
  who: z.string(),
});
export type SafetyCheckedItem = z.infer<typeof safetyCheckedItemSchema>;

export const safetyChecksSchema = z.object({
  /** Rules this recipe was run through and passed. */
  checked: z.array(safetyCheckedItemSchema),
  /** Canonical labels it fails (allergy or diet). */
  conflicts: z.array(z.string()),
  /** Kept notes the matcher cannot check (legacy free text, needsReview). */
  unchecked: z.array(z.string()),
  /**
   * Gluten-free-only: ingredients that need a certified label to be safe
   * (stock, curry powder, soy sauce…) but don't exclude by default (bug B-47).
   */
  labelCaveats: z.array(z.object({ ingredient: z.string(), rule: z.string() })).optional(),
});
export type SafetyChecks = z.infer<typeof safetyChecksSchema>;

export const tableSafetyPersonSchema = z.object({
  who: z.string(),
  isOwner: z.boolean(),
  items: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      kind: z.enum(['allergy', 'diet', 'dislike']),
    }),
  ),
  notes: z.array(z.string()),
});
export type TableSafetyPerson = z.infer<typeof tableSafetyPersonSchema>;

export const tableSafetySchema = z.object({
  people: z.array(tableSafetyPersonSchema),
  hasRules: z.boolean(),
  /** Legacy free text not yet confirmed against the taxonomy (UX-01 b). */
  needsReview: z.boolean(),
});
export type TableSafety = z.infer<typeof tableSafetySchema>;
