import { z } from 'zod';

// ─── AI chef: what a reply DID (UX-FOOD-21) ───────────────────────────────────
// The chat reply is a plain-text stream, and the chef can act through tools
// (swap a meal, add to the shopping list, log what you ate, import a recipe).
// A client that sends `x-chefer-chat-actions: 1` gets those actions as a
// trailer after the text, so it can show a "View / Undo" chip under the
// bubble. Clients that do not opt in (shipped builds, the web widget before
// it opted in) get the bare text stream, exactly as before.
//
// Wire format: `<text>` + CHAT_ACTIONS_MARKER + JSON array of ChatAction.
// The marker is two ASCII record-separator characters around a tag: it cannot
// appear in model prose, and a client splits on it with `splitChatActions`.

/** Request header that opts in to the action trailer. */
export const CHAT_ACTIONS_HEADER = 'x-chefer-chat-actions';
/** Separates the reply text from the JSON action list. */
export const CHAT_ACTIONS_MARKER = '\u001eCHEFER_ACTIONS\u001e';

export const chatActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('swap'),
    /** "Swapped Tuesday's lunch for Quinoa Bowl" */
    label: z.string(),
    planId: z.string(),
    /** 0 = Monday … 6 = Sunday */
    dayOfWeek: z.number().int().min(0).max(6),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    /** Index in the day's `meals`. */
    slotIndex: z.number().int().min(0),
    /** The recipe that WAS in the slot; absent = nothing to undo to. */
    previousRecipeId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('shopping'),
    label: z.string(),
    planId: z.string(),
    /** Keys of the custom items just added, for `shoppingList.removeCustomItem`. */
    keys: z.array(z.string()).max(20),
  }),
  z.object({
    kind: z.literal('logged'),
    label: z.string(),
    /** Local calendar day the entry landed on, YYYY-MM-DD. */
    date: z.string(),
    name: z.string(),
    kcal: z.number(),
  }),
  z.object({
    kind: z.literal('imported'),
    label: z.string(),
    recipeId: z.string(),
  }),
]);

export type ChatAction = z.infer<typeof chatActionSchema>;
