import { consentEventRepository, type ConsentEvent, type ConsentKind } from '@chefer/database';

// ─── ConsentService (§2.13, T-39.2) ────────────────────────────────────────────
// The single write path for every consent event in Chefer. Every consent
// writer (AI grant/revoke, email preferences, auto-plan weekly, terms
// acceptance, the analytics switches, health consent) calls `record()`
// instead of touching `consentEventRepository` directly, so the log is
// guaranteed 100% complete and every caller gets the same shape back.
//
// STABLE API — L-ENTRY (registration / terms acceptance) and L-TRACK
// (`setAutoPlanWeekly`) call this from other branches. Do not change this
// signature without checking in with those lanes.

export interface RecordConsentInput {
  userId: string;
  kind: ConsentKind;
  granted: boolean;
  /** 'web' | 'mobile' | 'migration'. */
  source: string;
  documentVersion?: string | null | undefined;
  providers?: string[] | undefined;
}

export class ConsentService {
  /** Appends one consent event. Never updates or deletes a row. */
  async record(input: RecordConsentInput): Promise<ConsentEvent> {
    return consentEventRepository.record({
      userId: input.userId,
      kind: input.kind,
      granted: input.granted,
      source: input.source,
      ...(input.documentVersion !== undefined && { documentVersion: input.documentVersion }),
      ...(input.providers !== undefined && { providers: input.providers }),
    });
  }

  /** This user's full consent log, newest first. */
  async history(userId: string): Promise<ConsentEvent[]> {
    return consentEventRepository.findAllByUser(userId);
  }

  /** The most recent event of one kind, or null if never recorded. */
  async latest(userId: string, kind: ConsentKind): Promise<ConsentEvent | null> {
    return consentEventRepository.findLatestByKind(userId, kind);
  }
}

export const consentService = new ConsentService();
