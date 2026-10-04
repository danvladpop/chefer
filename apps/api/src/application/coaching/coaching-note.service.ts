import type { TrainerNoteDto } from '@chefer/types';
import { notImplementedError } from '../../lib/coaching-errors.js';
import type { CoachingAccess } from './coaching-access.service.js';

// ─── Trainer coaching: the trainer's private note (spec §5.1, §8.3) ───────────
// Opaque text. Never logged, never in analytics, never word-filtered or parsed,
// never returned to the client. A1 (contract commit): signatures only.

export class CoachingNoteService {
  /** `trainer.client.note`: null when no note yet. */
  get(_access: CoachingAccess): Promise<TrainerNoteDto | null> {
    return Promise.reject(notImplementedError('trainer.client.note'));
  }

  /** `trainer.client.saveNote`: an empty body deletes the note (`{ body: '' }` is returned). */
  save(_access: CoachingAccess, _body: string): Promise<TrainerNoteDto> {
    return Promise.reject(notImplementedError('trainer.client.saveNote'));
  }
}

export const coachingNoteService = new CoachingNoteService();
