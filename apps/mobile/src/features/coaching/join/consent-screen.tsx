import { View } from 'react-native';
import { COACHING_COPY } from '@chefer/types';
import { Button, KeyboardAwareScrollView, Text } from '@chefer/ui-mobile';
import { CoachingCard } from '../../trainer/components/coaching-card';
import { COACHING_MOBILE_COPY } from '../copy';

// ─── Consent screen (spec §2.3) ───────────────────────────────────────────────
// The legal text of the COACHING_SHARING consent: every line comes from the shared COACHING_COPY (the
// web page renders the same strings). Do not reword here.

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
}: ConsentScreenProps) {
  const copy = COACHING_COPY.consent;
  const request = COACHING_COPY.request;
  const asking = mode === 'request';
  const allowLabel = asking
    ? request.sendConsent
    : currentTrainerName
      ? copy.switchTo(trainerName)
      : copy.allow;
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
        {asking ? request.askTitle(trainerName) : copy.title(trainerName)}
      </Text>
      <CoachingCard className="gap-4">
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
            {copy.willSeeHeading(trainerName)}
          </Text>
          <Bullets lines={copy.willSee} testID="coaching-consent-sees" />
        </View>
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
            {copy.canHeading(trainerName)}
          </Text>
          <Bullets lines={copy.can(trainerName)} testID="coaching-consent-can" />
        </View>
        <Text testID="coaching-consent-private" className="text-subhead text-label-secondary">
          {copy.privateNotes(trainerName)}
        </Text>
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-subhead font-semibold text-label">
            {copy.neverHeading(trainerName)}
          </Text>
          <Text testID="coaching-consent-never" className="text-subhead text-label-secondary">
            {copy.never}
          </Text>
        </View>
        <Text testID="coaching-consent-one" className="text-subhead text-label-secondary">
          {copy.oneTrainer(trainerName)}
        </Text>
        {currentTrainerName ? (
          <View className="rounded-control bg-brand-tint px-3 py-2">
            <Text testID="coaching-switch-line" className="text-subhead font-semibold text-label">
              {asking
                ? request.switchNote(currentTrainerName, trainerName)
                : copy.switchLine(currentTrainerName)}
            </Text>
          </View>
        ) : null}
        {asking ? (
          <Text testID="coaching-consent-no-follow" className="text-subhead text-label-secondary">
            {request.noFollow}
          </Text>
        ) : null}
      </CoachingCard>
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
          {COACHING_MOBILE_COPY.offlineJoin}
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
        {copy.notNow}
      </Button>
    </KeyboardAwareScrollView>
  );
}
