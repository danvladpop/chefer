import { View } from 'react-native';
import type { CoachingShareChoice } from '@chefer/types';
import { Button, KeyboardAwareScrollView, Text } from '@chefer/ui-mobile';
import { useT } from '../../../lib/i18n';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { consentCanLines, consentWillSeeLines } from '../copy';
import { SharingSwitches } from '../sharing/sharing-switches';

// ─── Consent screen (spec §2.3) ───────────────────────────────────────────────
// The legal text of the COACHING_SHARING consent: every line comes from the `coaching.consent.*`
// catalog (the web page renders the same strings). Do not reword here.

export type ConsentScreenProps = {
  /**
   * `join` (an invite link: "Ana wants to coach you in Chefer.") or `request` (Find a trainer → "Ask to
   * coach me": "Ask Ana to coach you?", "Allow and send request", PRD 2026-10 §4.1). The legal lines
   * between are the same COACHING_SHARING text either way.
   */
  mode?: 'join' | 'request';
  trainerName: string;
  /** The client's current trainer, when joining means switching. */
  currentTrainerName: string | null;
  busy: boolean;
  /** Joining needs a connection (it writes the consent). */
  offline: boolean;
  error: string | null;
  onAllow: () => void;
  onDecline: () => void;
  /**
   * Lane K1: the "Share my food log" / "Share my weight" switches, both off until the client turns them
   * on. Omitted = no switches (the screen reads as before).
   */
  share?: CoachingShareChoice;
  onShareChange?: (next: Partial<CoachingShareChoice>) => void;
};

function Bullets({ lines, testID }: { lines: readonly string[]; testID: string }) {
  return (
    <View className="gap-1.5">
      {lines.map((line, i) => (
        <View key={line} testID={`${testID}-${i}`} className="min-w-0 flex-row gap-2">
          <Text className="text-subhead text-label-secondary">•</Text>
          <Text className="min-w-0 flex-1 text-subhead text-label-secondary">{line}</Text>
        </View>
      ))}
    </View>
  );
}

export function ConsentScreen({
  mode = 'join',
  trainerName,
  currentTrainerName,
  busy,
  offline,
  error,
  onAllow,
  onDecline,
  share,
  onShareChange,
}: ConsentScreenProps) {
  const { t } = useT();
  const trainer = trainerName;
  const asking = mode === 'request';
  const allowLabel = asking
    ? t('coaching.request.sendConsent')
    : currentTrainerName
      ? t('coaching.consent.switchTo', { trainer })
      : t('coaching.consent.allow');
  return (
    <KeyboardAwareScrollView
      testID="coaching-consent"
      contentContainerClassName="gap-4 px-4 pb-8 pt-4"
    >
      <Text
        testID="coaching-consent-title"
        accessibilityRole="header"
        className="text-title2 font-bold text-label"
      >
        {asking
          ? t('coaching.request.askTitle', { trainer })
          : t('coaching.consent.title', { trainer })}
      </Text>
      <CoachingCard className="gap-4">
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
            {t('coaching.consent.willSeeHeading', { trainer })}
          </Text>
          <Bullets lines={consentWillSeeLines(t)} testID="coaching-consent-sees" />
        </View>
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
            {t('coaching.consent.canHeading', { trainer })}
          </Text>
          <Bullets lines={consentCanLines(trainer, t)} testID="coaching-consent-can" />
        </View>
        <Text testID="coaching-consent-private" className="text-subhead text-label-secondary">
          {t('coaching.consent.privateNotes', { trainer })}
        </Text>
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
            {t('coaching.consent.neverHeading', { trainer })}
          </Text>
          <Text testID="coaching-consent-never" className="text-subhead text-label-secondary">
            {t('coaching.consent.never')}
          </Text>
        </View>
        <Text testID="coaching-consent-one" className="text-subhead text-label-secondary">
          {t('coaching.consent.oneTrainer', { trainer })}
        </Text>
        {currentTrainerName ? (
          <View className="rounded-control bg-brand-tint px-3 py-2">
            <Text testID="coaching-switch-line" className="text-subhead font-semibold text-label">
              {asking
                ? t('coaching.request.switchNote', { current: currentTrainerName, trainer })
                : t('coaching.consent.switchLine', { current: currentTrainerName })}
            </Text>
          </View>
        ) : null}
        {asking ? (
          <Text testID="coaching-consent-no-follow" className="text-subhead text-label-secondary">
            {t('coaching.request.noFollow')}
          </Text>
        ) : null}
      </CoachingCard>
      {share && onShareChange ? (
        <CoachingCard className="gap-3">
          <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
            {t('coaching.sharing.heading')}
          </Text>
          <SharingSwitches
            testID="coaching-consent-share"
            trainerName={trainerName}
            value={share}
            onChange={onShareChange}
            disabled={busy}
          />
        </CoachingCard>
      ) : null}
      {error ? (
        <Text
          testID="coaching-consent-error"
          accessibilityRole="alert"
          className="text-subhead text-danger"
        >
          {error}
        </Text>
      ) : null}
      {offline ? (
        <Text testID="coaching-consent-offline" className="text-subhead text-label-secondary">
          {t('coaching.join.offlineJoin')}
        </Text>
      ) : null}
      <Button testID="coaching-consent-allow" loading={busy} disabled={offline} onPress={onAllow}>
        {allowLabel}
      </Button>
      <Button
        testID="coaching-consent-decline"
        variant="outline"
        disabled={busy}
        onPress={onDecline}
      >
        {t('coaching.consent.notNow')}
      </Button>
    </KeyboardAwareScrollView>
  );
}
