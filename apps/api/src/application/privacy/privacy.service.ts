import { consentEventRepository, type ConsentEvent } from '@chefer/database';

// ─── Privacy service (§2.8, §2.13, T-00.10 stub) ───────────────────────────────
// STUB — wave 0 only wires the layers. `grantHealthConsent`,
// `withdrawHealthData`, `exportData` and `recordAnalyticsConsent` (§2.8,
// §2.13, T-26.1/T-39.1-39.5) are wave 1; this class stays a thin passthrough
// until then.

export class PrivacyService {
  /** This user's full consent log, newest first — a passthrough read. */
  async listMyConsentEvents(userId: string): Promise<ConsentEvent[]> {
    return consentEventRepository.findAllByUser(userId);
  }
}

export const privacyService = new PrivacyService();
