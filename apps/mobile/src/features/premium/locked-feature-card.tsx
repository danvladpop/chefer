import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, colors, Text } from '@chefer/ui-mobile';
import { cn, PREMIUM_PITCH_COPY, premiumPitchFor } from '@chefer/utils';
import { openPremium } from './open-premium';

// PAT-3 — lock with a taste (technical-plan.md §2.3, UX-10 §5). A card that
// sits beside the free version of a job — never a padlock over content, never
// a replaced screen. The small lock in the eyebrow is the only lock affordance;
// the headline names the JOB the lock unlocks (from the pitch registry, keyed
// by `source`), "See what Premium adds" opens the premium sheet for that
// source, and an optional `freeAction` keeps the free path one tap away
// ("Or type it in yourself"). One of these per screen at most.

export interface LockedFeatureCardProps {
  /** The upgrade source (e.g. `household`) — picks the pitch and opens the sheet. */
  source: string;
  /** Override the job headline (defaults to the source's pitch headline). */
  job?: string;
  /** Override the one-line body (defaults to the source's lede). */
  body?: string;
  /** What you can do right now for free. */
  freeAction?: { label: string; onPress: () => void };
  compact?: boolean;
  /** Defaults to `openPremium(source)`; a test or a nested host can replace it. */
  onSeeWhatPremiumAdds?: (source: string) => void;
  testID?: string;
}

export function LockedFeatureCard({
  source,
  job,
  body,
  freeAction,
  compact = false,
  onSeeWhatPremiumAdds = openPremium,
  testID,
}: LockedFeatureCardProps) {
  const pitch = premiumPitchFor(source);
  return (
    <Card testID={testID} className={cn('gap-2', compact && 'gap-1.5 p-3')}>
      <View className="flex-row items-center gap-1">
        <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {PREMIUM_PITCH_COPY.eyebrow}
        </Text>
      </View>
      <Text variant="heading" className={compact ? 'text-base' : undefined}>
        {job ?? pitch.headline}
      </Text>
      <Text variant="muted" className="text-sm">
        {body ?? pitch.lede}
      </Text>
      <Pressable
        testID={testID ? `${testID}-see-what-premium-adds` : undefined}
        accessibilityRole="button"
        onPress={() => onSeeWhatPremiumAdds(source)}
        className="min-h-11 justify-center"
      >
        <Text className="text-sm font-semibold text-primary">
          {PREMIUM_PITCH_COPY.seeWhatPremiumAdds}
        </Text>
      </Pressable>
      {freeAction ? (
        <Button
          testID={testID ? `${testID}-free-action` : undefined}
          variant="outline"
          onPress={freeAction.onPress}
        >
          {freeAction.label}
        </Button>
      ) : null}
    </Card>
  );
}
