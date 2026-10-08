import { ActivityIndicator, View } from 'react-native';
import { FRIENDS_COPY } from '@chefer/types';
import { Card, ErrorState, Text, useQueryState } from '@chefer/ui-mobile';
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
  | 'SOCIAL_SHARING';

interface ConsentEventRow {
  kind: ConsentKind;
  granted: boolean;
  providers: string[];
  documentVersion: string | null;
  createdAt: Date | string;
}

function describe(event: ConsentEventRow): string {
  const version = event.documentVersion ? ` (v${event.documentVersion})` : '';
  const providers = event.providers.length > 0 ? ` (${event.providers.join(', ')})` : '';
  switch (event.kind) {
    case 'TERMS':
      return event.granted ? `Terms accepted${version}` : 'Terms declined';
    case 'PRIVACY':
      return event.granted ? `Privacy Policy accepted${version}` : 'Privacy Policy declined';
    case 'AGE':
      return "Confirmed you're 16 or older";
    case 'AI':
      return event.granted ? `AI features allowed${providers}` : 'AI features revoked';
    case 'ANALYTICS_ANON':
      return `Usage analytics: anonymous ${event.granted ? 'on' : 'off'}`;
    case 'ANALYTICS_LINKED':
      return `Usage analytics: ${event.granted ? 'linked to account' : 'unlinked from account'}`;
    case 'EMAIL_WEEK_READY':
      return `Weekly email (Monday): ${event.granted ? 'on' : 'off'}`;
    case 'EMAIL_RECAP':
      return `Weekly email (Sunday recap): ${event.granted ? 'on' : 'off'}`;
    case 'AUTO_PLAN':
      return `Plan my week every Sunday: ${event.granted ? 'on' : 'off'}`;
    case 'HEALTH':
      return event.granted ? 'Health information allowed' : 'Health information withdrawn';
    case 'SOCIAL_SHARING':
      // Following (code name `friends`): turned on, made public, shared
      // targets (granted) or turned off (withdrawn) — implementation-plan §7.
      return FRIENDS_COPY.consent.label(event.granted);
    default:
      return event.kind;
  }
}

function formatDate(at: Date | string): string {
  return new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConsentHistory() {
  const historyQuery = trpc.privacy.getConsentHistory.useQuery();
  // UX-X-12: a failed load is not "Nothing recorded yet" — that would tell a
  // user their consent history is empty when we simply could not read it.
  const { state, data, retry } = useQueryState(historyQuery, (rows) => rows.length === 0);

  return (
    <Card testID="profile-consent-history" className="gap-2">
      <Text variant="heading">Consent history</Text>
      {state === 'loading' ? (
        <ActivityIndicator color="#944a00" />
      ) : state === 'error' ? (
        <ErrorState
          testID="consent-history-error"
          title="Couldn't load your consent history"
          onRetry={retry}
          className="py-4"
        />
      ) : state === 'empty' || !data ? (
        <Text variant="muted" className="text-xs">
          Nothing recorded yet.
        </Text>
      ) : (
        <View className="gap-1.5">
          {data.map((event) => (
            <View key={event.id} className="flex-row justify-between gap-3">
              <Text className="min-w-0 flex-1 text-sm text-gray-800">
                {describe(event as ConsentEventRow)}
              </Text>
              <Text variant="muted" className="shrink-0 text-xs">
                {formatDate(event.createdAt)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
