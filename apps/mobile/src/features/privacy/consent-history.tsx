import { ActivityIndicator, View } from 'react-native';
import { Card, Text } from '@chefer/ui-mobile';
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
  | 'HEALTH';

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
  const { data, isLoading } = trpc.privacy.getConsentHistory.useQuery();

  return (
    <Card testID="profile-consent-history" className="gap-2">
      <Text variant="heading">Consent history</Text>
      {isLoading ? (
        <ActivityIndicator color="#944a00" />
      ) : !data || data.length === 0 ? (
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
