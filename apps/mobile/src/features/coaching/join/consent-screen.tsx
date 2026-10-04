import { View } from 'react-native';
import { COACHING_COPY } from '@chefer/types';
import { Button, Card, KeyboardAwareScrollView, Text } from '@chefer/ui-mobile';
import { COACHING_MOBILE_COPY } from '../copy';

// ─── Consent screen (spec §2.3) ───────────────────────────────────────────────
// The legal text of the COACHING_SHARING consent: every line comes from the shared COACHING_COPY (the
// web page renders the same strings). Do not reword here.

export type ConsentScreenProps = {
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
          <Text className="text-sm text-gray-700">•</Text>
          <Text className="min-w-0 flex-1 text-sm text-gray-700">{line}</Text>
        </View>
      ))}
    </View>
  );
}

export function ConsentScreen({
  trainerName,
  currentTrainerName,
  busy,
  offline,
  error,
  onAllow,
  onDecline,
}: ConsentScreenProps) {
  const copy = COACHING_COPY.consent;
  return (
    <KeyboardAwareScrollView
      testID="coaching-consent"
      contentContainerClassName="gap-4 px-4 pb-8 pt-4"
    >
      <Text testID="coaching-consent-title" accessibilityRole="header" variant="title">
        {copy.title(trainerName)}
      </Text>
      <Card className="gap-4">
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-sm font-semibold">
            {copy.willSeeHeading(trainerName)}
          </Text>
          <Bullets lines={copy.willSee} testID="coaching-consent-sees" />
        </View>
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-sm font-semibold">
            {copy.canHeading(trainerName)}
          </Text>
          <Bullets lines={copy.can(trainerName)} testID="coaching-consent-can" />
        </View>
        <Text testID="coaching-consent-private" className="text-sm text-gray-700">
          {copy.privateNotes(trainerName)}
        </Text>
        <View className="gap-1.5">
          <Text accessibilityRole="header" className="text-sm font-semibold">
            {copy.neverHeading(trainerName)}
          </Text>
          <Text testID="coaching-consent-never" className="text-sm text-gray-700">
            {copy.never}
          </Text>
        </View>
        <Text testID="coaching-consent-one" className="text-sm text-gray-700">
          {copy.oneTrainer(trainerName)}
        </Text>
        {currentTrainerName ? (
          <View className="rounded-lg bg-amber-50 px-3 py-2">
            <Text testID="coaching-switch-line" className="text-sm font-medium text-amber-900">
              {copy.switchLine(currentTrainerName)}
            </Text>
          </View>
        ) : null}
      </Card>
      {error ? (
        <Text
          testID="coaching-consent-error"
          accessibilityRole="alert"
          className="text-sm text-red-700"
        >
          {error}
        </Text>
      ) : null}
      {offline ? (
        <Text testID="coaching-consent-offline" variant="muted" className="text-sm">
          {COACHING_MOBILE_COPY.offlineJoin}
        </Text>
      ) : null}
      <Button testID="coaching-consent-allow" loading={busy} disabled={offline} onPress={onAllow}>
        {currentTrainerName ? copy.switchTo(trainerName) : copy.allow}
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
