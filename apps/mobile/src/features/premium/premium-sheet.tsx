import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, colors, Sheet, Text } from '@chefer/ui-mobile';
import { PREMIUM_PITCH_COPY, type PremiumPitch } from '@chefer/utils';
import { AiConsentHost } from '../ai-consent/ai-consent-provider';

// PAT-3 — the job-led premium sheet (technical-plan.md §2.3, UX-10 §1).
// Presentational: `PremiumHost` (premium-host.tsx) feeds it the pitch for the
// `source` a lock opened it with and owns the upgrade mutation.
//
//   offer   headline = the job it unlocks · lede · live bullets · "Also
//           included" · the INCLUDED terms paragraph · Turn on Premium /
//           Not now
//   success "Premium is on" · "You now have:" the bullets ticked · the job's
//           action (or Done) / Later
//   error   "Couldn't turn on Premium. Nothing has changed." · Try again
//
// The terms paragraph shows on every open and again on an error (AC2).
// Everything rendered comes from the pitch registry, which carries no price,
// currency, checkout or purchase link — Premium is the free toggle, and the
// iOS build must have no purchase path (App Review 3.1.1, delta rule 2). The
// registry filters out any bullet whose feature is not live (AC3).

export type PremiumSheetPhase = 'offer' | 'success' | 'error';

export interface PremiumSheetProps {
  visible: boolean;
  onClose: () => void;
  pitch: PremiumPitch;
  phase?: PremiumSheetPhase;
  /** The upgrade mutation is in flight. */
  pending?: boolean;
  onTurnOn: () => void;
  /** The job's next step after upgrading ("Add your table"); null → just Done. */
  successAction?: { label: string; onPress: () => void; loading?: boolean } | null;
  /** The job action failed (e.g. the week could not be built): say so, keep the button. */
  actionError?: string | null;
  onExited?: () => void;
  testID?: string;
}

export function PremiumSheet({
  visible,
  onClose,
  pitch,
  phase = 'offer',
  pending = false,
  onTurnOn,
  successAction = null,
  actionError = null,
  onExited,
  testID = 'premium-sheet',
}: PremiumSheetProps) {
  const [alsoIncludedOpen, setAlsoIncludedOpen] = useState(false);
  const success = phase === 'success';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onExited={onExited}
      title={success ? PREMIUM_PITCH_COPY.successTitle : pitch.headline}
      eyebrow={PREMIUM_PITCH_COPY.eyebrow}
      maxHeight="90%"
      testID={testID}
      footer={
        success ? (
          <View className="gap-2">
            {successAction ? (
              <Button
                testID={`${testID}-action`}
                loading={successAction.loading ?? false}
                onPress={successAction.onPress}
              >
                {successAction.label}
              </Button>
            ) : null}
            <Button
              testID={`${testID}-later`}
              variant={successAction ? 'outline' : 'default'}
              onPress={onClose}
            >
              {successAction ? PREMIUM_PITCH_COPY.later : 'Done'}
            </Button>
          </View>
        ) : (
          <View className="gap-2">
            <Button testID={`${testID}-turn-on`} loading={pending} onPress={onTurnOn}>
              {phase === 'error' ? PREMIUM_PITCH_COPY.tryAgain : PREMIUM_PITCH_COPY.turnOn}
            </Button>
            <Button testID={`${testID}-not-now`} variant="outline" onPress={onClose}>
              {PREMIUM_PITCH_COPY.notNow}
            </Button>
          </View>
        )
      }
    >
      {success ? (
        <View testID={`${testID}-success`} className="gap-2">
          <Text variant="muted" className="text-sm">
            {PREMIUM_PITCH_COPY.successLead}
          </Text>
          {pitch.bullets.map((bullet) => (
            <View key={bullet} className="flex-row items-start gap-2">
              <Ionicons name="checkmark" size={16} color={colors.primary} />
              <Text className="min-w-0 flex-1 text-sm">{bullet}</Text>
            </View>
          ))}
          {actionError ? (
            <Text testID={`${testID}-action-error`} className="text-sm text-red-600">
              {actionError}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="gap-3">
          <Text variant="muted" className="text-sm">
            {pitch.lede}
          </Text>
          {phase === 'error' ? (
            <Text testID={`${testID}-error`} className="text-sm text-red-600">
              {PREMIUM_PITCH_COPY.errorBody}
            </Text>
          ) : null}
          <View testID={`${testID}-bullets`} accessibilityRole="list" className="gap-2">
            {pitch.bullets.map((bullet) => (
              <View key={bullet} className="flex-row items-start gap-2">
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={colors.primary}
                  style={{ marginTop: 2 }}
                />
                <Text className="min-w-0 flex-1 text-sm">{bullet}</Text>
              </View>
            ))}
          </View>

          {pitch.alsoIncluded.length > 0 ? (
            <View>
              <Pressable
                testID={`${testID}-also-included-toggle`}
                accessibilityRole="button"
                accessibilityState={{ expanded: alsoIncludedOpen }}
                onPress={() => setAlsoIncludedOpen((v) => !v)}
                className="min-h-11 flex-row items-center justify-between"
              >
                <Text className="text-sm font-medium">{PREMIUM_PITCH_COPY.alsoIncluded}</Text>
                <Ionicons
                  name={alsoIncludedOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={colors.mutedForeground}
                />
              </Pressable>
              {alsoIncludedOpen ? (
                <View testID={`${testID}-also-included`} className="gap-1">
                  {pitch.alsoIncluded.map((item) => (
                    <View key={item} className="flex-row items-start gap-2">
                      <Text variant="muted" className="text-sm">
                        {'•'}
                      </Text>
                      <Text variant="muted" className="min-w-0 flex-1 text-sm">
                        {item}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* The terms are plain text, not a tooltip — read before the button (AC2). */}
          <View testID={`${testID}-terms`} className="gap-1 rounded-xl bg-muted p-3">
            <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {pitch.terms.heading}
            </Text>
            <Text variant="muted" className="text-xs">
              {pitch.terms.body}
            </Text>
          </View>
        </View>
      )}
      {/* The job action can start an AI generation (household → scale the week):
          the consent sheet nests here, since iOS cannot present a Modal over a Modal. */}
      <AiConsentHost />
    </Sheet>
  );
}
