import { consentEventRepository, type ConsentEvent } from '@chefer/database';
import { consentService } from './consent.service.js';

// ─── Privacy service (§2.8, §2.13, T-39.2) ─────────────────────────────────────
// `grantHealthConsent` / `withdrawHealthData` (§2.8, T-26.1) are wave 3
// (L-CONSENT); this wave adds the consent log surface (T-39.2) and the
// analytics-consent write path (T-12.3).

export type ConsentSource = 'web' | 'mobile' | 'migration';

export interface RecordAnalyticsConsentInput {
  userId: string;
  source: ConsentSource;
  /** Omit a switch that did not change — only the ones that changed are logged. */
  anonymous?: boolean | undefined;
  linked?: boolean | undefined;
}

export interface AcceptTermsInput {
  userId: string;
  source: ConsentSource;
  documentVersion: string;
  /** "I'm 16 or older" — logged as a separate AGE consent event when present. */
  ageConfirmed?: boolean | undefined;
}

export class PrivacyService {
  /** This user's full consent log, newest first — a passthrough read. */
  async listMyConsentEvents(userId: string): Promise<ConsentEvent[]> {
    return consentEventRepository.findAllByUser(userId);
  }

  /** Alias of `listMyConsentEvents` under the T-39.2 procedure name. */
  async getConsentHistory(userId: string): Promise<ConsentEvent[]> {
    return consentService.history(userId);
  }

  /**
   * Logs the analytics switches (device-local state — this call is what makes
   * a consent choice provable, per §2.13). Called by the web and mobile
   * consent cards whenever a switch changes; a switch the caller did not
   * touch is left out.
   */
  async recordAnalyticsConsent(input: RecordAnalyticsConsentInput): Promise<ConsentEvent[]> {
    const events: ConsentEvent[] = [];
    if (input.anonymous !== undefined) {
      events.push(
        await consentService.record({
          userId: input.userId,
          kind: 'ANALYTICS_ANON',
          granted: input.anonymous,
          source: input.source,
        }),
      );
    }
    if (input.linked !== undefined) {
      events.push(
        await consentService.record({
          userId: input.userId,
          kind: 'ANALYTICS_LINKED',
          granted: input.linked,
          source: input.source,
        }),
      );
    }
    return events;
  }

  /**
   * Re-acceptance of Terms/Privacy after a document version bump (T-39.1
   * covers acceptance AT sign-up via `auth.register`; this is the standing
   * "accept again" endpoint existing accounts hit from the re-accept sheet).
   */
  async acceptTerms(input: AcceptTermsInput): Promise<ConsentEvent[]> {
    const events: ConsentEvent[] = [
      await consentService.record({
        userId: input.userId,
        kind: 'TERMS',
        granted: true,
        source: input.source,
        documentVersion: input.documentVersion,
      }),
      await consentService.record({
        userId: input.userId,
        kind: 'PRIVACY',
        granted: true,
        source: input.source,
        documentVersion: input.documentVersion,
      }),
    ];
    if (input.ageConfirmed) {
      events.push(
        await consentService.record({
          userId: input.userId,
          kind: 'AGE',
          granted: true,
          source: input.source,
        }),
      );
    }
    return events;
  }
}

export const privacyService = new PrivacyService();
