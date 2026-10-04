import {
  chefProfileRepository,
  consentEventRepository,
  dietaryPreferencesRepository,
  householdMemberRepository,
  prisma,
  userRepository,
  weightEntryRepository,
  type ConsentEvent,
} from '@chefer/database';
import { COACHING_API_LEVEL, HEALTH_CONSENT_VERSION } from '@chefer/types';
import { consentService } from './consent.service.js';

// ─── Privacy service (§2.8, §2.13, T-26.1, T-39.2) ─────────────────────────────
// The consent-log surface (T-39.2), the analytics-consent write path (T-12.3)
// and the health-information consent (T-26.1: grant + withdraw-and-delete).

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

export interface HealthConsentInput {
  userId: string;
  source: ConsentSource;
  /** Copy version the user saw (recorded on the grant). */
  version?: string | undefined;
}

/**
 * Trainer coaching (spec §10): a client below COACHING_API_LEVEL has no label for
 * a `COACHING_SHARING` row (old mobile would print the raw enum), so those rows
 * are not sent to it. `level` is the RAW `x-chefer-api-level`. The rows stay in
 * the log (and in the account export): only the old clients' view is filtered.
 */
export function filterConsentEventsForLevel<T extends { kind: string }>(
  events: readonly T[],
  level: number,
): T[] {
  return level >= COACHING_API_LEVEL
    ? [...events]
    : events.filter((e) => e.kind !== 'COACHING_SHARING');
}

export class PrivacyService {
  /**
   * This user's full consent log, newest first — a passthrough read. `level`
   * defaults to 0, the safe side: a caller that forgets it never leaks the
   * coaching rows to an old client.
   */
  async listMyConsentEvents(userId: string, level = 0): Promise<ConsentEvent[]> {
    return filterConsentEventsForLevel(await consentEventRepository.findAllByUser(userId), level);
  }

  /** Alias of `listMyConsentEvents` under the T-39.2 procedure name. */
  async getConsentHistory(userId: string, level = 0): Promise<ConsentEvent[]> {
    return filterConsentEventsForLevel(await consentService.history(userId), level);
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
   * T-26.1: records the user's consent to store health information —
   * `ConsentEvent` kind HEALTH plus the `User.healthDataConsentAt` cache the
   * `requireHealthConsent` middleware reads, in ONE transaction. Idempotent:
   * granting again keeps the original timestamp (a double tap is a no-op).
   * Separate from the AI data consent (`user.grantAiDataConsent`).
   */
  async grantHealthConsent(input: HealthConsentInput): Promise<{ healthDataConsentAt: Date }> {
    const existing = await userRepository.findHealthConsentAt(input.userId);
    if (existing) return { healthDataConsentAt: existing };
    const at = new Date();
    const version = input.version ?? HEALTH_CONSENT_VERSION;
    // The event is written here (not through ConsentService.record) so it can
    // share the transaction with the cache column.
    await prisma.$transaction([
      userRepository.setHealthConsent(input.userId, at, version),
      prisma.consentEvent.create({
        data: {
          userId: input.userId,
          kind: 'HEALTH',
          granted: true,
          source: input.source,
          documentVersion: version,
          providers: [],
          createdAt: at,
        },
      }),
    ]);
    return { healthDataConsentAt: at };
  }

  /**
   * T-26.1 / UX-26 AC3: withdraws health consent AND deletes the health
   * information — allergies, diets and dislikes (owner + every household
   * member), goal, body metrics and own targets, every weigh-in — then
   * records the withdrawal. One transaction: all or nothing. The account, its
   * household members (as people) and non-health data stay. Plans stop
   * carrying `safetyChecks` on their own: they are computed on read from the
   * (now empty) rules.
   *
   * Also cleared, because they hold copies of the same data:
   * - `target_changes` (before/after of goal and targets);
   * - `safety_reports.rulesSnapshot` (the allergy list in force when a recipe
   *   was reported) — the report rows themselves are kept as the evidence
   *   trail (T-26.7). PENDING COUNSEL: retention of the report rows.
   *
   * Runs whether or not a consent record exists: data saved before consent
   * existed (Q-7, PENDING COUNSEL) must be deletable too. Keep in step with
   * `application/user/account-data.service.ts` (`exportAccountData` lists the
   * same tables; `deleteAccount` cascades them all).
   */
  async withdrawHealthData(input: HealthConsentInput): Promise<{ healthDataConsentAt: null }> {
    const at = new Date();
    await prisma.$transaction([
      dietaryPreferencesRepository.clearHealthData(input.userId),
      householdMemberRepository.clearHealthData(input.userId),
      chefProfileRepository.clearHealthData(input.userId),
      weightEntryRepository.deleteAllForUser(input.userId),
      prisma.targetChange.deleteMany({ where: { userId: input.userId } }),
      prisma.safetyReport.updateMany({
        where: { userId: input.userId },
        data: { rulesSnapshot: {} },
      }),
      userRepository.setHealthConsent(input.userId, null, null),
      prisma.consentEvent.create({
        data: {
          userId: input.userId,
          kind: 'HEALTH',
          granted: false,
          source: input.source,
          providers: [],
          createdAt: at,
        },
      }),
    ]);
    return { healthDataConsentAt: null };
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
