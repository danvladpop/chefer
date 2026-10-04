import { TRPCError } from '@trpc/server';
import { coachingNoteRepository, type ICoachingNoteRepository } from '@chefer/database';
import type { TrainerNoteDto } from '@chefer/types';
import { clientUnavailableError } from '../../lib/coaching-errors.js';
import type { CoachingAccess } from './coaching-access.service.js';

// ─── Trainer coaching: the trainer's private note (spec §5.1, §8.3) ───────────
// Free text the trainer keeps about one client. OPAQUE to the app:
//   - never parsed, searched, word-filtered or sent to AI;
//   - never in analytics events (no content, no length) and never returned by any
//     client-facing procedure;
//   - never logged: the tRPC logger records only the path, and a failed write is
//     rethrown WITHOUT its cause so the body can't reach Sentry or the log through
//     a database error message (Prisma errors quote the query arguments).
// This file is the only place that touches the body.

export class CoachingNoteService {
  constructor(private readonly notes: ICoachingNoteRepository = coachingNoteRepository) {}

  /** `trainer.client.note`: null when there is no (visible) note yet. */
  async get(access: CoachingAccess): Promise<TrainerNoteDto | null> {
    const note = await this.notes.find(access.trainerId, access.clientId);
    // A hidden note (the link ended) is not readable in Phase 1.
    if (note?.hiddenAt !== null) return null;
    return { body: note.body, updatedAt: note.updatedAt.toISOString() };
  }

  /**
   * `trainer.client.saveNote`: needs an ACTIVE link (the `note` scope alone only
   * reads). An empty body deletes the note and returns `{ body: '' }`.
   */
  async save(access: CoachingAccess, body: string): Promise<TrainerNoteDto> {
    if (!access.link) throw clientUnavailableError();
    try {
      if (body === '') {
        await this.notes.delete(access.trainerId, access.clientId);
        return { body: '', updatedAt: new Date().toISOString() };
      }
      const row = await this.notes.upsert(access.trainerId, access.clientId, body);
      return { body: row.body, updatedAt: row.updatedAt.toISOString() };
    } catch {
      // Deliberately no `cause`: see the header.
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not save the note.' });
    }
  }
}

export const coachingNoteService = new CoachingNoteService();
