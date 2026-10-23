import { ActivityIndicator, View } from 'react-native';
import type { Translator } from '@chefer/i18n';
import { COACHING_CONSENT_LABELS, FRIENDS_COPY } from '@chefer/types';
import { Card, ErrorState, Text, useQueryState } from '@chefer/ui-mobile';
import { useT } from '../../lib/i18n';
import { trpc } from '../../lib/trpc';

// ─── Consent history (UX-39, T-39.2) ───────────────────────────────────────────
// Profile › Privacy & data → "Consent history": every consent event this
// account has ever recorded, newest first. Revoking never erases a past
// record — this list is the proof.

// Mirrors the Prisma `ConsentKind` enum (packages/database/prisma/schema.prisma)
// without importing it — apps never import @prisma/client types directly
// (CLAUDE.md); the value arrives over tRPC as a plain string.
type ConsentKind =
  | 'TERMS'
  | 'PRIVACY'
  | 'AGE'
  | 'AI'
  | 'ANALYTICS_ANON'
  | 'ANALYTICS_LINKED'
  | 'EMAIL_WEEK_READY'
  | 'EMAIL_RECAP'
  | 'AUTO_PLAN'
  | 'HEALTH'
  | 'SOCIAL_SHARING'
  | 'COACHING_SHARING';

interface ConsentEventRow {
  kind: ConsentKind;
  granted: boolean;
  providers: string[];
  documentVersion: string | null;
  createdAt: Date | string;
}

function describe(event: ConsentEventRow, t: Translator['t']): string {
  const { documentVersion: version } = event;
  switch (event.kind) {
    case 'TERMS':
      if (!event.granted) return t('consent.history.termsDeclined');
      return version
        ? t('consent.history.termsAcceptedVersion', { version })
        : t('consent.history.termsAccepted');
    case 'PRIVACY':
      if (!event.granted) return t('consent.history.privacyDeclined');
      return version
        ? t('consent.history.privacyAcceptedVersion', { version })
        : t('consent.history.privacyAccepted');
    case 'AGE':
      return t('consent.history.age');
    case 'AI':
      if (!event.granted) return t('consent.history.aiRevoked');
      return event.providers.length > 0
        ? t('consent.history.aiAllowedProviders', { providers: event.providers.join(', ') })
        : t('consent.history.aiAllowed');
    case 'ANALYTICS_ANON':
      return event.granted
        ? t('consent.history.analyticsAnonOn')
        : t('consent.history.analyticsAnonOff');
    case 'ANALYTICS_LINKED':
      return event.granted
        ? t('consent.history.analyticsLinked')
        : t('consent.history.analyticsUnlinked');
    case 'EMAIL_WEEK_READY':
      return event.granted
        ? t('consent.history.emailWeekReadyOn')
        : t('consent.history.emailWeekReadyOff');
    case 'EMAIL_RECAP':
      return event.granted ? t('consent.history.emailRecapOn') : t('consent.history.emailRecapOff');
    case 'AUTO_PLAN':
      return event.granted ? t('consent.history.autoPlanOn') : t('consent.history.autoPlanOff');
    case 'HEALTH':
      return event.granted
        ? t('consent.history.healthAllowed')
        : t('consent.history.healthWithdrawn');
    case 'SOCIAL_SHARING':
      // Following (code name `friends`): turned on, made public, shared
      // targets (granted) or turned off (withdrawn) — implementation-plan §7.
      return FRIENDS_COPY.consent.label(event.granted);
    case 'COACHING_SHARING':
      // Trainer coaching (WP-18): joined a trainer (granted) or the link ended (withdrawn). Level 6+ only:
      // the API filters these rows out below it, so an older bundle never prints the raw enum.
      return COACHING_CONSENT_LABELS[event.granted ? 'granted' : 'withdrawn'];
    default:
      return event.kind;
  }
}

export function ConsentHistory() {
  const { t, date } = useT();
  const historyQuery = trpc.privacy.getConsentHistory.useQuery();
  // UX-X-12: a failed load is not "Nothing recorded yet" — that would tell a
  // user their consent history is empty when we simply could not read it.
  const { state, data, retry } = useQueryState(historyQuery, (rows) => rows.length === 0);

  return (
    <Card testID="profile-consent-history" className="gap-2">
      <Text variant="heading">{t('consent.history.title')}</Text>
      {state === 'loading' ? (
        <ActivityIndicator color="#944a00" />
      ) : state === 'error' ? (
        <ErrorState
          testID="consent-history-error"
          title={t('consent.history.loadError')}
          onRetry={retry}
          className="py-4"
        />
      ) : state === 'empty' || !data ? (
        <Text variant="muted" className="text-xs">
          {t('consent.history.empty')}
        </Text>
      ) : (
        <View className="gap-1.5">
          {data.map((event) => (
            <View key={event.id} className="flex-row justify-between gap-3">
              <Text className="min-w-0 flex-1 text-sm text-gray-800">
                {describe(event as ConsentEventRow, t)}
              </Text>
              <Text variant="muted" className="shrink-0 text-xs">
                {date(event.createdAt, 'datetime')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
