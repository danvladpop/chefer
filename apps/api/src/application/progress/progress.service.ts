import { TRPCError } from '@trpc/server';
import type {
  AchievementsDto,
  FinishCookInput,
  FinishCookResult,
  FlameInfo,
  ProgressAckInput,
  ProgressInbox,
  ProgressMarkSeenInput,
  ProgressSettings,
  ProgressSettingsPatch,
  ProgressSummary,
  Receipt,
  WeeklyRecap,
} from '@chefer/types';

// ─── ProgressService (docs/gamification-2026-10/tech-plan.md §4) ──────────────
// CONTRACT STUB: the signatures are final; lane B replaces the bodies. Mobile
// and web build against `progress.*` through these types.

function notImplemented(): never {
  throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: 'Kitchen progress is not built yet.' });
}

export type ProgressUser = { id: string; email: string };

export class ProgressService {
  /** First call creates the state, pays WELCOME and back-dates history (§7). */
  async summary(_user: ProgressUser, _localDate: string): Promise<ProgressSummary> {
    return notImplemented();
  }

  async inbox(_userId: string): Promise<ProgressInbox> {
    return notImplemented();
  }

  async ack(_userId: string, _input: ProgressAckInput): Promise<{ ok: true }> {
    return notImplemented();
  }

  async receiptFor(
    _userId: string,
    _kind: 'WORKOUT' | 'COOK',
    _sourceId: string,
  ): Promise<Receipt | null> {
    return notImplemented();
  }

  /** Always stores the CookLog (D1); the receipt is null when progress is off for the user. */
  async finishCook(_user: ProgressUser, _input: FinishCookInput): Promise<FinishCookResult> {
    return notImplemented();
  }

  async achievements(_userId: string): Promise<AchievementsDto> {
    return notImplemented();
  }

  async weeklyRecap(_userId: string, _weekStart: string): Promise<WeeklyRecap> {
    return notImplemented();
  }

  async updateSettings(_userId: string, _patch: ProgressSettingsPatch): Promise<ProgressSettings> {
    return notImplemented();
  }

  async setActiveDayGoal(_userId: string, _goal: number, _localDate: string): Promise<FlameInfo> {
    return notImplemented();
  }

  async pauseFlame(_userId: string, _startDate: string, _weeks: number): Promise<FlameInfo> {
    return notImplemented();
  }

  async resumeFlame(_userId: string, _localDate: string): Promise<FlameInfo> {
    return notImplemented();
  }

  async markSeen(_userId: string, _input: ProgressMarkSeenInput): Promise<{ ok: true }> {
    return notImplemented();
  }
}

export const progressService = new ProgressService();
