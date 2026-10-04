import type { CoachingNote } from '@prisma/client';
import { prisma } from '../client';

// ─── Trainer coaching: the private note (docs/trainer-platform/spec.md §5.1) ──
// Free text the trainer keeps about one client. Opaque to the app: never parsed,
// searched, filtered, logged, analysed or sent to AI, and never returned to the
// client. Keyed by the PAIR, not the link: a client who leaves and comes back
// within the retention window gets the same note back.

export interface ICoachingNoteRepository {
  /** The row, hidden or not (the access service decides who may read it). */
  find(trainerId: string, clientId: string): Promise<CoachingNote | null>;
  /** Creates or replaces the body; also un-hides the note. */
  upsert(trainerId: string, clientId: string, body: string): Promise<CoachingNote>;
  delete(trainerId: string, clientId: string): Promise<void>;
  /** Maintenance: deletes notes hidden before `cutoff`. */
  deleteHiddenBefore(cutoff: Date): Promise<number>;
}

export class CoachingNoteRepository implements ICoachingNoteRepository {
  async find(trainerId: string, clientId: string): Promise<CoachingNote | null> {
    return prisma.coachingNote.findUnique({
      where: { trainerId_clientId: { trainerId, clientId } },
    });
  }

  async upsert(trainerId: string, clientId: string, body: string): Promise<CoachingNote> {
    return prisma.coachingNote.upsert({
      where: { trainerId_clientId: { trainerId, clientId } },
      create: { trainerId, clientId, body },
      update: { body, hiddenAt: null },
    });
  }

  async delete(trainerId: string, clientId: string): Promise<void> {
    await prisma.coachingNote.deleteMany({ where: { trainerId, clientId } });
  }

  async deleteHiddenBefore(cutoff: Date): Promise<number> {
    const res = await prisma.coachingNote.deleteMany({ where: { hiddenAt: { lt: cutoff } } });
    return res.count;
  }
}

export const coachingNoteRepository = new CoachingNoteRepository();
