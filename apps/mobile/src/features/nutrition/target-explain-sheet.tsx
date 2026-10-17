import { router } from 'expo-router';
import type { ProteinWhy, TargetsView } from '@chefer/types';
import { ExplainSheet } from '@chefer/ui-mobile';
import {
  explainCarbsFatSentence,
  explainKcalSentence,
  explainProteinSentence,
} from '@chefer/utils';
import { useNumbersMode } from '../numbers-mode/numbers-mode';
import { ProteinWhySheet } from './protein-why-sheet';

// ─── TargetExplainSheet (§2.11, T-11.2) ─────────────────────────────────────────
// UX-11 AC3: tapping the ring, a macro, or the day totals opens this sheet.
// Thin wrapper over the shared ExplainSheet (PAT-1) — the sentences are pure
// functions of `TargetsView.inputs` (explain-targets.ts) so the wording is
// identical to web's.

export interface TargetExplainSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `targets.get`'s resolved view — omitted while it's still loading. */
  view: (TargetsView & { proteinWhy?: ProteinWhy | undefined }) | undefined;
  testID?: string;
}

export function TargetExplainSheet({ visible, onClose, view, testID }: TargetExplainSheetProps) {
  const { proteinOnly } = useNumbersMode();
  // WP-08: protein-only mode explains the one number it shows — no calories, carbs or fat.
  if (proteinOnly) {
    return (
      <ProteinWhySheet
        visible={visible}
        onClose={onClose}
        why={view?.proteinWhy}
        action={{
          label: 'Change your targets',
          onPress: () => {
            onClose();
            router.push('/preferences');
          },
        }}
        testID={testID ?? 'target-explain-sheet'}
      />
    );
  }
  const rows = view
    ? [
        { label: 'Calories', value: `${view.effective.dailyCalorieTarget.toLocaleString()} kcal` },
        { label: 'Protein', value: `${view.effective.proteinG} g` },
        { label: 'Carbs', value: `${view.effective.carbsG} g` },
        { label: 'Fat', value: `${view.effective.fatG} g` },
      ]
    : [];

  const sentence = view
    ? view.source === 'own'
      ? 'You set this target yourself.'
      : explainKcalSentence(view.inputs)
    : undefined;

  const footnote = view
    ? [explainProteinSentence(view.inputs), explainCarbsFatSentence()].join(' ')
    : undefined;

  return (
    <ExplainSheet
      visible={visible}
      onClose={onClose}
      eyebrow="Your target"
      title="Why this number"
      sentence={sentence}
      rows={rows}
      footnote={footnote}
      testID={testID ?? 'target-explain-sheet'}
      action={{
        label: view?.source === 'own' ? 'Use the suggested target' : 'Set your own target',
        onPress: () => {
          onClose();
          router.push('/preferences');
        },
      }}
    />
  );
}
