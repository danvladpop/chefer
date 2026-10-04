import type { InviteDto, InvitePreviewDto } from '@chefer/types';
import { notImplementedError } from '../../lib/coaching-errors.js';

// ─── Trainer coaching: invites (spec §2.2, §7.2, §7.3) ────────────────────────
// A1 (contract commit): final signatures, bodies land in A2.

export class CoachingInviteService {
  /** `trainer.invites.list`: the trainer's invites from the last 30 days. */
  list(_trainerId: string): Promise<InviteDto[]> {
    return Promise.reject(notImplementedError('trainer.invites.list'));
  }

  /** `trainer.invites.create`: at most 20 open invites; code from crypto random. */
  create(_trainerId: string, _label: string | undefined): Promise<InviteDto> {
    return Promise.reject(notImplementedError('trainer.invites.create'));
  }

  /** `trainer.invites.revoke` */
  revoke(_trainerId: string, _code: string): Promise<{ ok: true }> {
    return Promise.reject(notImplementedError('trainer.invites.revoke'));
  }

  /** `coaching.previewInvite` */
  preview(_clientId: string, _code: string): Promise<InvitePreviewDto> {
    return Promise.reject(notImplementedError('coaching.previewInvite'));
  }
}

export const coachingInviteService = new CoachingInviteService();
