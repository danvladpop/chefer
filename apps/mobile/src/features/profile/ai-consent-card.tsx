import { Linking, Switch, View } from 'react-native';
import { AI_CONSENT_COPY } from '@chefer/types';
import { Button, Card, Text } from '@chefer/ui-mobile';
import { aiConsentToggleOn } from '@chefer/utils';
import { getWebUrl } from '../../lib/api-url';
import { trpc } from '../../lib/trpc';
import { useAiProviderDisclosure } from '../ai-consent/use-ai-providers';

// AI & your data (App Store 5.1.2(i)) — the standing control for the consent
// the AI guard asks for before the first AI action. Off = the next AI action
// asks again. Mirrors apps/web/src/features/profile/components/AiConsentCard.tsx.

const TRACK = { true: '#944a00', false: '#d1d5db' };

export function AiConsentCard() {
  const utils = trpc.useUtils();
  const { data: user } = trpc.user.me.useQuery(undefined, { staleTime: 30_000 });
  const providers = useAiProviderDisclosure();
  const onSaved = ({ aiDataConsentAt }: { aiDataConsentAt: Date | null }) =>
    utils.user.me.setData(undefined, (prev) => (prev ? { ...prev, aiDataConsentAt } : prev));
  const grant = trpc.user.grantAiDataConsent.useMutation({ onSuccess: onSaved });
  const revoke = trpc.user.revokeAiDataConsent.useMutation({ onSuccess: onSaved });
  const busy = grant.isPending || revoke.isPending;
  const enabled = Boolean(user?.aiDataConsentAt);

  return (
    <Card testID="profile-ai-consent" className="gap-2">
      <Text variant="heading">{AI_CONSENT_COPY.cardTitle}</Text>
      <View className="min-h-11 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-gray-900">{AI_CONSENT_COPY.toggleTitle}</Text>
          <Text variant="muted" className="text-xs">
            {enabled ? aiConsentToggleOn(providers) : AI_CONSENT_COPY.toggleOff}
          </Text>
        </View>
        <Switch
          testID="profile-ai-consent-switch"
          accessibilityLabel={AI_CONSENT_COPY.toggleTitle}
          value={enabled}
          disabled={!user || busy}
          onValueChange={(next) => (next ? grant.mutate() : revoke.mutate())}
          trackColor={TRACK}
        />
      </View>
      <Button
        variant="ghost"
        size="sm"
        onPress={() => void Linking.openURL(getWebUrl(AI_CONSENT_COPY.privacyPath))}
      >
        {AI_CONSENT_COPY.privacyLabel}
      </Button>
      {(grant.isError || revoke.isError) && (
        <Text className="text-xs text-red-600">{AI_CONSENT_COPY.saveError}</Text>
      )}
    </Card>
  );
}
