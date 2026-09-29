import { View } from 'react-native';
import { HEALTH_CONSENT_COPY } from '@chefer/types';
import { Button, Sheet, Text } from '@chefer/ui-mobile';

// ─── HealthDataConsentSheet (UX-26, T-26.2) ───────────────────────────────────
// Modelled on the AI consent sheet (ai-consent-provider.tsx): heading, an
// explanation, a bulleted what/why/where/choice list, then two full-width
// buttons — neither pre-selected, the choice comes after the explanation.
// SEPARATE from the AI data consent. `useHealthConsent()` decides when it
// opens; this is the presentational part. PENDING COUNSEL REVIEW (copy).

export interface HealthConsentSheetProps {
  visible: boolean;
  saving: boolean;
  saveFailed: boolean;
  onAllow: () => void;
  onDecline: () => void;
  onExited?: () => void;
}

const LINES = [
  HEALTH_CONSENT_COPY.what,
  HEALTH_CONSENT_COPY.why,
  HEALTH_CONSENT_COPY.where,
  HEALTH_CONSENT_COPY.choice,
] as const;

export function HealthConsentSheet({
  visible,
  saving,
  saveFailed,
  onAllow,
  onDecline,
  onExited,
}: HealthConsentSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onDecline}
      {...(onExited && { onExited })}
      eyebrow={HEALTH_CONSENT_COPY.eyebrow}
      title={HEALTH_CONSENT_COPY.title}
      testID="health-consent"
      footer={
        <View className="gap-2">
          <Button testID="health-consent-allow" size="lg" loading={saving} onPress={onAllow}>
            {HEALTH_CONSENT_COPY.allow}
          </Button>
          <Button
            testID="health-consent-decline"
            size="lg"
            variant="outline"
            disabled={saving}
            onPress={onDecline}
          >
            {HEALTH_CONSENT_COPY.decline}
          </Button>
        </View>
      }
    >
      <Text className="text-base text-gray-800">{HEALTH_CONSENT_COPY.intro}</Text>
      <View className="gap-2">
        {LINES.map((line) => (
          <View key={line.label} className="flex-row gap-2">
            <Text className="text-sm text-gray-700">•</Text>
            <Text className="min-w-0 flex-1 text-sm text-gray-700">
              <Text className="text-sm font-semibold text-gray-900">{line.label}: </Text>
              {line.text}
            </Text>
          </View>
        ))}
      </View>
      {saveFailed && <Text className="text-sm text-red-700">{HEALTH_CONSENT_COPY.saveError}</Text>}
    </Sheet>
  );
}
