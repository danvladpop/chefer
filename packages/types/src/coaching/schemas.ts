// ─── Trainer coaching: Zod inputs (spec §7) ───────────────────────────────────
// Shared by the API (tRPC inputs), web and mobile. Additive only once mobile
// binaries ship. DTOs (outputs) are in ./dto.

import { z } from 'zod';
import { localDateSchema, setOverrideInputSchema } from '../gym/schemas';
import { COACHING_LIMITS } from './limits';

/** Crockford base32: digits and letters without I, L, O, U. */
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]+$/;

/**
 * An invite code as typed or pasted: whitespace and dashes ignored, case
 * folded, and the Crockford look-alikes (I, L → 1; O → 0) fixed up.
 */
export function normalizeInviteCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

export const inviteCodeSchema = z
  .string()
  .max(40)
  .transform(normalizeInviteCode)
  .refine((c) => c.length === COACHING_LIMITS.inviteCodeLength && CODE_PATTERN.test(c), {
    message: 'That invite link is not valid.',
  });

export const coachingSourceSchema = z.enum(['web', 'mobile']);
export type CoachingSource = z.infer<typeof coachingSourceSchema>;

/** The other user's id on every `trainer.client.*` procedure (a malformed id is a BAD_REQUEST, anything else a uniform NOT_FOUND). */
export const coachingClientIdSchema = z.string().min(1).max(64);

export const clientIdInputSchema = z.object({ clientId: coachingClientIdSchema });

// ─── Trainer profile and invites ──────────────────────────────────────────────

export const trainerDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(COACHING_LIMITS.displayNameMaxChars);

export const trainerProfileInputSchema = z.object({ displayName: trainerDisplayNameSchema });
export type TrainerProfileInput = z.infer<typeof trainerProfileInputSchema>;

export const createInviteInputSchema = z.object({
  label: z.string().trim().max(COACHING_LIMITS.inviteLabelMaxChars).optional(),
});
export const revokeInviteInputSchema = z.object({ code: inviteCodeSchema });

/** `trainer.clients.list`: `today` (the trainer's device-local date) decides "this week"; omitted = the server's UTC date. */
export const clientsListInputSchema = z.object({ today: localDateSchema.optional() }).optional();

// ─── One client ───────────────────────────────────────────────────────────────

export const clientOverviewInputSchema = z.object({
  clientId: coachingClientIdSchema,
  /** The trainer's device-local date (week and 14-day strip boundaries). */
  today: localDateSchema,
});

export const clientWorkoutsInputSchema = z.object({
  clientId: coachingClientIdSchema,
  cursor: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(COACHING_LIMITS.workoutsPageSize).default(10),
});

export const clientExerciseHistoryInputSchema = z.object({
  clientId: coachingClientIdSchema,
  exerciseId: z.string().min(1).max(100),
});

// ─── The routine document the trainer saves ───────────────────────────────────

/**
 * Same as `routineExerciseDocSchema` minus `notes` (the client's own note is
 * never shown to or written by the trainer: it is kept as stored on existing
 * rows and null on new ones) plus `trainerNote`.
 */
export const trainerRoutineExerciseDocSchema = z
  .object({
    /** Existing id to keep; omit for a new row. */
    id: z.string().max(100).optional(),
    exerciseId: z.string().min(1).max(100),
    sets: z.number().int().min(1).max(10),
    repMin: z.number().int().min(1).max(3600),
    repMax: z.number().int().min(1).max(3600),
    targetRir: z.number().int().min(0).max(4),
    restSec: z.number().int().min(15).max(900),
    supersetGroup: z.string().max(20).nullable(),
    /** A short cue the client sees. Trimmed by the API; empty = no note. */
    trainerNote: z.string().max(COACHING_LIMITS.trainerNoteMaxChars).nullable(),
  })
  .refine((e) => e.repMin <= e.repMax, { message: 'repMin must be ≤ repMax' });
export type TrainerRoutineExerciseDoc = z.infer<typeof trainerRoutineExerciseDocSchema>;

export const trainerRoutineDayDocSchema = z.object({
  id: z.string().max(100).optional(),
  name: z.string().min(1).max(40),
  plannedWeekday: z.number().int().min(0).max(6).nullable(),
  exercises: z.array(trainerRoutineExerciseDocSchema).max(20),
});
export type TrainerRoutineDayDoc = z.infer<typeof trainerRoutineDayDocSchema>;

export const trainerRoutineDocSchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(60),
  days: z.array(trainerRoutineDayDocSchema).min(1).max(7),
});
export type TrainerRoutineDoc = z.infer<typeof trainerRoutineDocSchema>;

export const saveTrainerRoutineInputSchema = z.object({
  clientId: coachingClientIdSchema,
  routine: trainerRoutineDocSchema,
  expectedVersion: z.number().int().min(1),
});

/**
 * Only when the client has NO active routine: create one in the client's account
 * and make it active. `templateKey` instantiates a program template for the
 * client's equipment; otherwise a blank routine with `days` days (default 3).
 */
export const createClientRoutineInputSchema = z.object({
  clientId: coachingClientIdSchema,
  templateKey: z.string().min(1).max(40).optional(),
  days: z.number().int().min(1).max(7).optional(),
});

// ─── Next-session targets (the D5c override, spec §6) ─────────────────────────

export const setNextTargetInputSchema = setOverrideInputSchema.extend({
  clientId: coachingClientIdSchema,
});

export const clearNextTargetInputSchema = z.object({
  clientId: coachingClientIdSchema,
  exerciseId: z.string().min(1).max(100),
  repBucket: z.string().min(1).max(20),
});

// ─── Private note (opaque text) ───────────────────────────────────────────────

export const saveNoteInputSchema = z.object({
  clientId: coachingClientIdSchema,
  /** Free text. Never parsed, filtered, logged or sent anywhere. Empty deletes the note. */
  body: z.string().max(COACHING_LIMITS.noteMaxChars),
});

// ─── Client side (coaching.*) ─────────────────────────────────────────────────

export const previewInviteInputSchema = z.object({ code: inviteCodeSchema });

/**
 * `source` is accepted for parity with other consent writers; the API derives
 * it from the `x-chefer-client` header and ignores this value.
 */
export const joinInputSchema = z.object({
  code: inviteCodeSchema,
  source: coachingSourceSchema.optional(),
});
export const leaveInputSchema = z.object({ source: coachingSourceSchema.optional() }).optional();
