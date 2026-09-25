import type { RoutineDto } from '@chefer/types';

// ─── Structured CONFLICT payloads ─────────────────────────────────────────────
// A TRPCError's `cause` never reaches the client, so conflicts that clients
// must resolve (gym routine document saves — "keep mine / take theirs") carry
// the server's current version in a ConflictCause, which the tRPC
// errorFormatter (lib/trpc.ts) copies to `error.data.conflict`. Everything
// else gets `data.conflict: null`. Additive: new kinds extend the union.

export type ConflictPayload = { kind: 'routine'; current: RoutineDto };

export class ConflictCause extends Error {
  constructor(readonly payload: ConflictPayload) {
    super(`${payload.kind} version conflict`);
    this.name = 'ConflictCause';
  }
}
