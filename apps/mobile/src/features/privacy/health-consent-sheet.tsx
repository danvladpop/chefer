import { View } from 'react-native';
import { Button, Sheet, Text } from '@chefer/ui-mobile';
import { useT } from '../../lib/i18n';

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
  /** "Don't save it" — the one explicit decline. */
  onDecline: () => void;
  /** ✕, backdrop or Android BACK: close without answering (UX-ONB-03). Defaults to `onDecline`. */
  onCancel?: () => void;
  onExited?: () => void;
}

export function HealthConsentSheet({
  visible,
  saving,
  saveFailed,
  onAllow,
  onDecline,
  onCancel,
  onExited,
}: HealthConsentSheetProps) {
  const { t } = useT();
  const lines = [
    { label: t('consent.health.whatLabel'), text: t('consent.health.whatText') },
    { label: t('consent.health.whyLabel'), text: t('consent.health.whyText') },
    { label: t('consent.health.whereLabel'), text: t('consent.health.whereText') },
    { label: t('consent.health.choiceLabel'), text: t('consent.health.choiceText') },
  ];
  return (
    <Sheet
      visible={visible}
      onClose={onCancel ?? onDecline}
      {...(onExited && { onExited })}
      eyebrow={t('consent.health.eyebrow')}
      title={t('consent.health.title')}
      testID="health-consent"
      footer={
        <View className="gap-2">
          <Button testID="health-consent-allow" size="lg" loading={saving} onPress={onAllow}>
            {t('consent.health.allow')}
          </Button>
          <Button
            testID="health-consent-decline"
            size="lg"
            variant="outline"
            disabled={saving}
            onPress={onDecline}
          >
            {t('consent.health.decline')}
          </Button>
        </View>
      }
    >
      <Text className="text-base text-gray-800">{t('consent.health.intro')}</Text>
      <View className="gap-2">
        {lines.map((line) => (
          <View key={line.label} className="flex-row gap-2">
            <Text className="text-sm text-gray-700">•</Text>
            <Text className="min-w-0 flex-1 text-sm text-gray-700">
              <Text className="text-sm font-semibold text-gray-900">{line.label}: </Text>
              {line.text}
            </Text>
          </View>
        ))}
      </View>
      {saveFailed && <Text className="text-sm text-red-700">{t('consent.health.saveError')}</Text>}
    </Sheet>
  );
}
