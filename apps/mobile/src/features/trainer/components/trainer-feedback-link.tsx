import { Linking } from 'react-native';
import { COACHING_COPY, SUPPORT_EMAIL } from '@chefer/types';
import { PressableScale, Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';

// "Send feedback" in Trainer tools (PRD 2026-10 §4.1): one pre-addressed email to support, the same
// mailto pattern as Following's appeal link (RN core `Linking`, no native module). The subject names the
// feature so the owner can sort trainer feedback out of the inbox (in English: it is for the support inbox).

export function trainerFeedbackMailto(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(COACHING_COPY.trainer.title)}`;
}

export function TrainerFeedbackLink({ testID = 'trainer-feedback' }: { testID?: string }) {
  const { t } = useT();
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="link"
      accessibilityHint={SUPPORT_EMAIL}
      onPress={() => {
        Linking.openURL(trainerFeedbackMailto()).catch(() => undefined);
      }}
      className="min-h-11 items-center justify-center self-center px-3"
    >
      <Text className="text-subhead font-semibold text-brand">
        {t('coaching.trainer.profile.feedback')}
      </Text>
    </PressableScale>
  );
}
