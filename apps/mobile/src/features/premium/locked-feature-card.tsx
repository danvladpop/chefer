import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, colors, Text } from '@chefer/ui-mobile';
import { cn } from '@chefer/utils';

// PAT-3 — lock with a taste (technical-plan.md §2.3 / synthesis
// 03-ux-design-spec.md §2.3). UI shell only (T-00.16): no wiring to a real
// upgrade source's copy or the nudge cap — L-MONEY supplies `job`/`body`
// (from the premium-pitch copy table, T-00.6) and wires `onSeeWhatPremiumAdds`
// to open PremiumSheet with this card's `source`.

export interface LockedFeatureCardProps {
  /** Existing upgrade-source string (e.g. `household`) — handed back to
   * `onSeeWhatPremiumAdds` so the caller can open PremiumSheet with it. */
  source: string;
  /** The job headline, e.g. "Two of us". */
  job: string;
  /** One line: what Premium does for this job. */
  body: string;
  /** What you can do right now for free. */
  freeAction?: { label: string; onPress: () => void };
  compact?: boolean;
  onSeeWhatPremiumAdds: (source: string) => void;
  testID?: string;
}

/** Never a padlock over content — the eyebrow's small lock icon is the only
 * lock affordance. One of these per screen at most (rule, not enforced here). */
export function LockedFeatureCard({
  source,
  job,
  body,
  freeAction,
  compact = false,
  onSeeWhatPremiumAdds,
  testID,
}: LockedFeatureCardProps) {
  return (
    <Card testID={testID} className={cn('gap-2', compact && 'gap-1.5 p-3')}>
      <View className="flex-row items-center gap-1">
        <Ionicons name="lock-closed-outline" size={14} color={colors.mutedForeground} />
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          PREMIUM
        </Text>
      </View>
      <Text variant="heading" className={compact ? 'text-base' : undefined}>
        {job}
      </Text>
      <Text variant="muted" className="text-sm">
        {body}
      </Text>
      <Pressable
        testID={testID ? `${testID}-see-what-premium-adds` : undefined}
        accessibilityRole="button"
        onPress={() => onSeeWhatPremiumAdds(source)}
        className="min-h-11 justify-center"
      >
        <Text className="text-sm font-semibold text-primary">See what Premium adds</Text>
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
