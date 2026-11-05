import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CoachExplanation } from '@chefer/types';
import { Rotate, Text, useThemeColors } from '@chefer/ui-mobile';
import { useUnitSystem } from '../../hooks/use-unit-system';
import { track } from '../../lib/analytics';
import { useT } from '../../lib/i18n';
import { coachExplanationCopy } from './coach-copy';

// ─── "Why this suggestion" (market review 2026-10, lane D2) ──────────────────
// The weekly review's deterministic explanation: a few plain sentences and
// the numbers behind them, in the user's units. Free and premium see the same
// reasoning; only premium sees the suggested number (the API withholds it).
// Collapsed by default; MO-05: the chevron turns with the section.

export function CoachWhy({
  explanation,
  tier,
  proteinOnly = false,
}: {
  explanation: CoachExplanation;
  tier: 'free' | 'premium';
  proteinOnly?: boolean;
}) {
  const colors = useThemeColors();
  const system = useUnitSystem();
  const [open, setOpen] = useState(false);
  const tr = useT();
  const { lines, data } = coachExplanationCopy(tr, explanation, system, { proteinOnly });

  return (
    <View testID="coach-why" className="mt-2 rounded-inner bg-surface-sunken px-3 py-1">
      <Pressable
        testID="coach-why-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          if (!open) track('coach_why_viewed', { tier, reason: explanation.reason });
          setOpen((o) => !o);
        }}
        className="min-h-11 flex-row items-center justify-between gap-2"
      >
        <Text className="text-sm font-semibold text-label">{tr.t('today.coachWhy.title')}</Text>
        <Rotate turned={open}>
          <Ionicons name="chevron-down" size={16} color={colors.labelSecondary} />
        </Rotate>
      </Pressable>
      {open ? (
        <View testID="coach-why-panel" className="gap-2 pb-2">
          {lines.map((line) => (
            <Text key={line} className="text-sm text-label">
              {line}
            </Text>
          ))}
          {data.length > 0 ? (
            <View className="mt-1 gap-1 border-t border-separator pt-2">
              {data.map((row) => (
                <View key={row.label} className="flex-row justify-between gap-3">
                  <Text className="text-xs text-label-secondary">{row.label}</Text>
                  <Text className="min-w-0 flex-shrink text-right text-xs font-medium text-label">
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
