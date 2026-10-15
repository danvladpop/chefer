import { z } from "zod";

export const headlinesSchema = z.object({
  /** Opening title, "{pet}" is replaced with petName. */
  intro: z.string(),
  /** Tag under the opening title. */
  introTag: z.string(),
  /** "{pet}" is replaced with petName. */
  hook: z.string(),
  /** Word in `hook` that gets struck through at ~frame 35… */
  hookStruck: z.string(),
  /** …and the word written over it. */
  hookReplacement: z.string(),
  mealPlan: z.string(),
  shop: z.string(),
  cook: z.string(),
  train: z.string(),
  payoff: z.string(),
  endCardSubline: z.string(),
});

export const sfxSchema = z.object({
  tap: z.string(),
  whoosh: z.string(),
  tick: z.string(),
  chime: z.string(),
});

export const cheferAdSchema = z.object({
  petName: z.string(),
  headlines: headlinesSchema,
  playStoreLive: z.boolean(),
  /** File in public/ or a URL. Fades out over the last 15 frames. */
  musicSrc: z.string().optional(),
  /** Where in the track to start (skip a slow intro). */
  musicStartSeconds: z.number().min(0),
  /** Gain for the track (1 = as mastered), to level quieter tracks. */
  musicVolume: z.number().min(0).max(3),
  /** Narration (Kokoro clips from scripts/generate-voiceover.mjs). Music ducks under it. */
  voiceover: z.enum(["none", "heart"]),
  /** Optional SFX per hook point (file in public/ or URL); empty = silent. */
  sfx: sfxSchema,
});

export type CheferAdProps = z.infer<typeof cheferAdSchema>;
export type Headlines = z.infer<typeof headlinesSchema>;
