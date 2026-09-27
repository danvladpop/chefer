import { Pressable, View } from 'react-native';
import { Button } from './button';
import { Card } from './card';
import { Text } from './text';

// PAT-14 — Change notice ("never change it silently"), technical-plan.md
// §2.14 / rev 2's `rows` generalisation. Props-only shell (T-00.16): the
// dashboard/gym lanes that recompute targets, training-day rules or
// regenerated weeks render this at the top of Today and wire `primary` /
// `secondary` / `why` to the actual mutation and ExplainSheet.

export interface ChangeNoticeRow {
  label: string;
  before: string;
  after: string;
}

export interface ChangeNoticeCardProps {
  /** Small uppercase line above the title. Defaults to `CHANGED`. */
  eyebrow?: string;
  title: string;
  /** One row per changed number, e.g. { label: 'Protein', before: '128 g', after: '93 g' }. */
  rows: ChangeNoticeRow[];
  /** One sentence naming why, e.g. "Because you finished gym setup…". */
  reason: string;
  /** Keeps the new value(s) — the card's main action. */
  primary: { label: string; onPress: () => void };
  /** Reverts to the old value(s). */
  secondary: { label: string; onPress: () => void };
  /** Text link to the ExplainSheet for the rule behind the change. */
  why?: { onPress: () => void };
  testID?: string;
}

/**
 * Renders at the top of Today (or Gym Today) until answered — one at a
 * time, newest first, never auto-dismissing. `accessibilityRole="alert"` so
 * a screen reader announces it as soon as it mounts.
 */
export function ChangeNoticeCard({
  eyebrow = 'CHANGED',
  title,
  rows,
  reason,
  primary,
  secondary,
  why,
  testID,
}: ChangeNoticeCardProps) {
  return (
    <Card testID={testID} accessibilityRole="alert" className="gap-3">
      <View>
        <Text className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {eyebrow}
        </Text>
        <Text variant="heading">{title}</Text>
      </View>

      <View className="gap-2">
        {rows.map((row) => (
          <View key={row.label} className="gap-0.5">
            <Text variant="muted" className="text-xs">
              {row.label}
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-base font-medium">{row.before}</Text>
              <Text variant="muted">→</Text>
              <Text className="text-base font-semibold">{row.after}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text className="text-sm">{reason}</Text>

      <View className="gap-2 pt-1">
        <Button testID={testID ? `${testID}-primary` : undefined} onPress={primary.onPress}>
          {primary.label}
        </Button>
        <Button
          testID={testID ? `${testID}-secondary` : undefined}
          variant="outline"
          onPress={secondary.onPress}
        >
          {secondary.label}
        </Button>
        {why ? (
          <Pressable
            testID={testID ? `${testID}-why` : undefined}
            accessibilityRole="button"
            onPress={why.onPress}
            className="min-h-11 items-center justify-center"
          >
            <Text className="text-sm font-medium text-primary">Why?</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
