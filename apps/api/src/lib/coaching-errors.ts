import { TRPCError } from '@trpc/server';
import { COACHING_COPY } from '@chefer/types';

// ─── Trainer coaching: structured error causes (spec §7.1) ────────────────────
// Same pattern as lib/friends-errors.ts: a TRPCError's `cause` never reaches the
// client, so the machine-readable part travels in a typed cause class that the
// tRPC errorFormatter (lib/trpc.ts) copies to `error.data.reason`. Additive:
// every other error carries `reason: null` (or the AI-consent value).
//
// One error for every denial on `trainer.client.*` (a missing link, an ended
// link, a stranger, yourself, a malformed-but-valid id): NOT_FOUND "This client
// isn't available", never a reason. It is the access oracle's only answer.

/** `data.reason: 'TRAINER_TOOLS_OFF'` — the caller has no active trainer profile. */
export class TrainerToolsOffCause extends Error {
  constructor() {
    super('trainer tools off');
    this.name = 'TrainerToolsOffCause';
  }
}

/** NOT_FOUND for the whole coaching surface while the flag is off for this user (like Following). */
export function coachingUnavailableError(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.notFound });
}

/** FORBIDDEN + `data.reason = 'TRAINER_TOOLS_OFF'`. */
export function trainerToolsOffError(): TRPCError {
  return new TRPCError({
    code: 'FORBIDDEN',
    message: COACHING_COPY.server.trainerToolsOff,
    cause: new TrainerToolsOffCause(),
  });
}

/** NOT_FOUND "This client isn't available": no link, ended link, self, stranger, flag off for the client... */
export function clientUnavailableError(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: COACHING_COPY.server.clientUnavailable });
}

/** A procedure whose contract is final but whose body lands in A2. Never reaches production. */
export function notImplementedError(what: string): TRPCError {
  return new TRPCError({ code: 'NOT_IMPLEMENTED', message: `${what} is not implemented yet.` });
}
