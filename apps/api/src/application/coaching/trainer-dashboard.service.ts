import { coachingContentRepository, type ICoachingContentRepository } from '@chefer/database';
import type { TrainerBadgesDto, TrainerDashboardSummaryDto } from '@chefer/types';
import { addDaysLocal, summarizeTrainerDashboard, trainerBadges } from '@chefer/utils';
import { coachingLinkService, type CoachingLinkService } from './coaching-link.service.js';
import { coachingRequestService, type CoachingRequestService } from './coaching-request.service.js';

// ─── Trainer mode: badges and Today (docs/prd-2026-10/trainer-mode.md §6.1, §7.1) ──
//
//   badges    one count source for every trainer badge, polled every 60 s:
//             pending requests (blocks hidden, exactly the Clients list's
//             count); attendance and booking changes join with bookings (M3).
//   summary   trainer Today's numbers, built from the same client list the
//             Clients tab shows, so "all numbers match the underlying lists".
//
// Both run behind trainerProcedure: an active trainer only. Neither names a
// client the trainer is not actively coaching.

export interface TrainerDashboardDeps {
  links: Pick<CoachingLinkService, 'listClients'>;
  requests: Pick<CoachingRequestService, 'listForTrainer'>;
  content: Pick<ICoachingContentRepository, 'countSessions'>;
}

const defaultDeps: TrainerDashboardDeps = {
  links: coachingLinkService,
  requests: coachingRequestService,
  content: coachingContentRepository,
};

export class TrainerDashboardService {
  private readonly deps: TrainerDashboardDeps;

  constructor(deps: Partial<TrainerDashboardDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  async badges(trainerId: string): Promise<TrainerBadgesDto> {
    const requests = await this.deps.requests.listForTrainer(trainerId);
    return trainerBadges({ requests: requests.length, unmarkedAttendance: 0, bookingChanges: 0 });
  }

  async summary(trainerId: string, today: string): Promise<TrainerDashboardSummaryDto> {
    const [clients, requests] = await Promise.all([
      this.deps.links.listClients(trainerId, today),
      this.deps.requests.listForTrainer(trainerId),
    ]);
    const sessionsLast7 =
      clients.length === 0
        ? new Map<string, number>()
        : await this.deps.content.countSessions(
            clients.map((c) => c.clientId),
            addDaysLocal(today, -6),
            today,
          );
    return summarizeTrainerDashboard({
      clients,
      sessionsLast7,
      requestsWaiting: requests.length,
    });
  }
}

export const trainerDashboardService = new TrainerDashboardService();
