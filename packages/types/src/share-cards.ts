import { z } from 'zod';

// ─── Share cards (market review 2026-10, lane E2) ────────────────────────────
// A shareable image for a recipe, a finished cook, a workout with PRs or the
// weekly recap, with Chefer branding and an app link. `share.create` snapshots
// ONLY the fields the card shows into a `ShareCard` row and returns a public
// link; the web app renders the image server-side (next/og), so the phone
// needs no new native code.
//
// Privacy (the Following rules, docs/friends/dpia.md): a card never carries
// allergies, diets, body weight, logged meals, notes or the person's name.
// Anything beyond the defaults (nutrition numbers, protein days) is an
// explicit opt-in on the create call.

export const SHARE_CARD_KINDS = ['recipe', 'cook', 'workout', 'recap'] as const;
export type ShareCardKind = (typeof SHARE_CARD_KINDS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const id = z.string().min(1).max(64);

export const createShareCardInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('recipe'),
    recipeId: id,
    /** Opt-in: kcal + protein per serving on the card. */
    showNutrition: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('cook'),
    recipeId: id,
    showNutrition: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('workout'),
    sessionId: id,
    /** The session's PRs (weights lifted, never body weight). On by default. */
    showPrs: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('recap'),
    weekStart: isoDate,
    localDate: isoDate.optional(),
    /** What the recap card shows. Protein days are opt-in. */
    include: z
      .object({
        cooking: z.boolean().default(true),
        protein: z.boolean().default(false),
        training: z.boolean().default(true),
      })
      .default({}),
  }),
]);
export type CreateShareCardInput = z.input<typeof createShareCardInputSchema>;
export type CreateShareCardParsed = z.infer<typeof createShareCardInputSchema>;

/** What a card renders — exactly what was snapshotted, nothing more. */
export type ShareCardPayload =
  | {
      kind: 'recipe' | 'cook';
      title: string;
      imageUrl: string | null;
      totalMinutes: number | null;
      servings: number | null;
      /** Present only when the user opted in. */
      nutrition?: { kcal: number; proteinG: number };
    }
  | {
      kind: 'workout';
      title: string;
      /** "YYYY-MM-DD". */
      localDate: string;
      exercises: number;
      sets: number;
      durationMin: number | null;
      /** "Bench Press" + "62.5 kg × 5", in the lifter's own unit. */
      prs?: { exerciseName: string; label: string }[];
    }
  | {
      kind: 'recap';
      label: string;
      cooking?: { cookedFromPlan: number; newRecipesTried: number };
      protein?: { hit: number; logged: number };
      training?: { sessions: number; prCount: number; streakWeeks: number };
    };

/** `share.create` output. */
export interface ShareCardLink {
  id: string;
  /** Public landing page with the card and the app link. */
  url: string;
  /** The PNG itself (1080 × 1350). */
  imageUrl: string;
}

/** `share.get` (public) output. */
export interface ShareCardDto {
  id: string;
  payload: ShareCardPayload;
  createdAt: Date;
}

export const getShareCardInputSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9]{10,32}$/) });
