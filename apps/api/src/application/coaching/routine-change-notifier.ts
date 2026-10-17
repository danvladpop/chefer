import {
  coachingLinkRepository,
  exerciseRepository,
  type CoachingLink,
  type ICoachingLinkRepository,
  type IExerciseRepository,
  type RoutineWithDays,
} from '@chefer/database';
import type { RoutineChange } from '@chefer/types';
import { summarizeRoutineChanges, type ChangeDay } from '@chefer/utils';
import { coachingNoticeService, type CoachingNoticeService } from './coaching-notice.service.js';

// ─── "<Trainer> updated your routine" (PRD 2026-10 §4.2) ──────────────────────
// After a save of a coached client's ACTIVE routine, the other side gets (or
// adds to) a card listing what changed in plain words. Both directions: the
// trainer's edits for the client, the client's edits for the trainer, "so
// neither side is surprised". Never fails the save that triggered it.

export interface RoutineChangeNotifierDeps {
  links: Pick<ICoachingLinkRepository, 'findActiveForClient'>;
  exercises: Pick<IExerciseRepository, 'findVisibleByIds'>;
  notices: Pick<CoachingNoticeService, 'routineUpdated'>;
}

const defaultDeps: RoutineChangeNotifierDeps = {
  links: coachingLinkRepository,
  exercises: exerciseRepository,
  notices: coachingNoticeService,
};

function toChangeDays(row: RoutineWithDays): ChangeDay[] {
  return row.days.map((d) => ({
    id: d.id,
    name: d.name,
    plannedWeekday: d.plannedWeekday,
    exercises: d.exercises.map((e) => ({
      id: e.id,
      exerciseId: e.exerciseId,
      sets: e.sets,
      repMin: e.repMin,
      repMax: e.repMax,
      trainerNote: e.trainerNote,
    })),
  }));
}

export class RoutineChangeNotifier {
  private readonly deps: RoutineChangeNotifierDeps;

  constructor(deps: Partial<RoutineChangeNotifierDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps };
  }

  /** The client's ACTIVE coaching, read before a client save (null = no card to write). */
  coachingOf(clientId: string): Promise<CoachingLink | null> {
    return this.deps.links.findActiveForClient(clientId);
  }

  /** The trainer saved the client's routine. */
  async trainerSaved(
    clientId: string,
    trainerId: string,
    before: RoutineWithDays,
    after: RoutineWithDays,
  ): Promise<void> {
    await this.notify(clientId, trainerId, 'TRAINER', () => this.changes(clientId, before, after));
  }

  /** The trainer set up a routine for a client who had none. */
  async trainerCreated(clientId: string, trainerId: string): Promise<void> {
    await this.notify(clientId, trainerId, 'TRAINER', async () => [{ kind: 'created' }]);
  }

  /** The coached client saved their own ACTIVE routine. */
  async clientSaved(
    link: CoachingLink,
    before: RoutineWithDays,
    after: RoutineWithDays,
  ): Promise<void> {
    if (!after.isActive) return;
    await this.notify(link.trainerId, link.clientId, 'CLIENT', () =>
      this.changes(link.clientId, before, after),
    );
  }

  private async changes(
    clientId: string,
    before: RoutineWithDays,
    after: RoutineWithDays,
  ): Promise<RoutineChange[]> {
    const ids = [
      ...new Set(
        [...before.days, ...after.days].flatMap((d) => d.exercises.map((e) => e.exerciseId)),
      ),
    ];
    const rows = await this.deps.exercises.findVisibleByIds(clientId, ids);
    const names = new Map(rows.map((r) => [r.id, r.name]));
    return summarizeRoutineChanges(
      toChangeDays(before),
      toChangeDays(after),
      (id) => names.get(id) ?? 'An exercise',
    );
  }

  private async notify(
    recipientId: string,
    actorId: string,
    actorRole: 'TRAINER' | 'CLIENT',
    changes: () => Promise<RoutineChange[]>,
  ): Promise<void> {
    try {
      await this.deps.notices.routineUpdated(recipientId, actorId, actorRole, await changes());
    } catch (err) {
      // console, not lib/logger: this module is reached from gym code whose tests load no env.
      console.warn('[coaching] notice failed:', err instanceof Error ? err.name : 'unknown');
    }
  }
}

export const routineChangeNotifier = new RoutineChangeNotifier();
