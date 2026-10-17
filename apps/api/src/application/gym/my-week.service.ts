import { TRPCError } from '@trpc/server';
import type { RoutineDto, SaveMyWeekInput } from '@chefer/types';
import { applyMyWeek, MY_WEEK_MAX_DAYS, newMyWeekDays, plannedDayCount } from '@chefer/utils';
import { notifyTargetsChanged } from '../targets/targets-changed.js';
import { gymProfileService, type GymProfileService } from './gym-profile.service.js';
import { routineService, type RoutineService } from './routine.service.js';

// ─── My week (simple training mode §6.4, ADR 0001) ────────────────────────────
// My week edits the ONE active routine — never a second plan. The edited week
// is applied with the shared `applyMyWeek` and saved through the ordinary,
// versioned `routineService.save`, so a stale edit gets the same CONFLICT (and
// coaching the same attribution) as any routine edit. The first save creates
// the routine; an all-Rest week of type-only days archives it (nothing in it).
// The weekly goal defaults to the planned-day count (still editable).

export interface SaveMyWeekResult {
  /** The active routine after the save, or null when the week is all Rest. */
  routine: RoutineDto | null;
  weeklyGoal: number | null;
}

export class MyWeekService {
  constructor(
    private readonly routines: Pick<
      RoutineService,
      'getActive' | 'save' | 'createMyWeek' | 'archive'
    > = routineService,
    private readonly profiles: Pick<GymProfileService, 'get' | 'save'> = gymProfileService,
  ) {}

  async save(userId: string, input: SaveMyWeekInput): Promise<SaveMyWeekResult> {
    const profile = await this.profiles.get(userId);
    if (!profile) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Finish gym setup first.' });
    }
    const active = await this.routines.getActive(userId);
    let routine: RoutineDto | null = active;

    if (!active) {
      const days = newMyWeekDays(input.week);
      if (days.length > 0) routine = await this.routines.createMyWeek(userId, days);
    } else {
      const applied = applyMyWeek(active, input.week);
      if (applied.kind === 'too_many_days') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `A routine holds up to ${MY_WEEK_MAX_DAYS} days. Put an unscheduled day on a weekday, or remove one, first.`,
        });
      }
      if (applied.kind === 'empty') {
        await this.routines.archive(userId, active.id);
        await notifyTargetsChanged(userId);
        routine = null;
      } else {
        routine = await this.routines.save(
          userId,
          applied.doc,
          input.expectedVersion ?? active.version,
        );
      }
    }

    const planned = plannedDayCount(input.week);
    const weeklyGoal = input.weeklyGoal ?? (planned > 0 ? planned : null);
    if (weeklyGoal !== null && weeklyGoal !== profile.weeklyGoal) {
      await this.profiles.save(userId, { weeklyGoal });
    }
    return { routine, weeklyGoal: weeklyGoal ?? profile.weeklyGoal };
  }
}

export const myWeekService = new MyWeekService();
