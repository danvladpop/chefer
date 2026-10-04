import type { ClientRowDto, CoachingSource, CoachingStatusDto } from '@chefer/types';
import { notImplementedError } from '../../lib/coaching-errors.js';

// ─── Trainer coaching: links (spec §2.3, §2.7, §7.2, §7.3) ────────────────────
// A1 (contract commit): final signatures, bodies land in A2.

export class CoachingLinkService {
  /** `coaching.join`: one transaction, see CoachingLinkRepository.join. */
  join(_clientId: string, _code: string, _source: CoachingSource): Promise<CoachingStatusDto> {
    return Promise.reject(notImplementedError('coaching.join'));
  }

  /** `coaching.status` */
  status(_clientId: string): Promise<CoachingStatusDto> {
    return Promise.reject(notImplementedError('coaching.status'));
  }

  /** `coaching.leave`: the routine stays the client's. */
  leave(_clientId: string, _source: CoachingSource): Promise<CoachingStatusDto> {
    return Promise.reject(notImplementedError('coaching.leave'));
  }

  /** `trainer.clients.list` */
  listClients(_trainerId: string, _today: string | undefined): Promise<ClientRowDto[]> {
    return Promise.reject(notImplementedError('trainer.clients.list'));
  }

  /** `trainer.clients.remove` */
  removeClient(
    _trainerId: string,
    _clientId: string,
    _source: CoachingSource,
  ): Promise<{ ok: true }> {
    return Promise.reject(notImplementedError('trainer.clients.remove'));
  }
}

export const coachingLinkService = new CoachingLinkService();
