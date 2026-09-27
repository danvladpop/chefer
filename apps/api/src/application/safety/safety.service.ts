import { safetyReportRepository, type SafetyReport } from '@chefer/database';

// ─── Safety service (§2.1, T-00.10 stub) ───────────────────────────────────────
// STUB — wave 0 only wires the layers (Router → Service → Repository) so no
// lane edits `routers/index.ts` later. The real filter (`SafetyService.
// loadTable/check/filter`, §2.1) is wave 1 (T-01.1-T-01.9); this class stays
// a thin passthrough until then.

export class SafetyService {
  /** Every recipe this user has reported, newest first — a passthrough read. */
  async listMyReports(userId: string): Promise<SafetyReport[]> {
    return safetyReportRepository.findAllByUser(userId);
  }
}

export const safetyService = new SafetyService();
