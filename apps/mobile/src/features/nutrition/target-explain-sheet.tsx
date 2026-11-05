import { router } from 'expo-router';
import type { ProteinWhy, TargetsView } from '@chefer/types';
import { ExplainSheet } from '@chefer/ui-mobile';
import {
  explainCarbsFatSentence,
  explainKcalSentence,
  explainProteinSentence,
} from '@chefer/utils';
import { useT } from '../../lib/i18n';
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
  const { proteinOnly, noNumbers } = useNumbersMode();
  const { t, number } = useT();
  // Lane E3 "Hide numbers": targets are never explained in figures.
  if (noNumbers) return null;
  // WP-08: protein-only mode explains the one number it shows — no calories, carbs or fat.
  if (proteinOnly) {
    return (
      <ProteinWhySheet
        visible={visible}
        onClose={onClose}
        why={view?.proteinWhy}
        action={{
          label: t('today.settings.targetExplain.changeTargets'),
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
        {
          label: t('today.settings.targetExplain.calories'),
          value: t('today.settings.targetExplain.value.kcal', {
            value: number(view.effective.dailyCalorieTarget),
          }),
        },
        {
          label: t('today.settings.targetExplain.protein'),
          value: t('today.settings.grams.protein', { value: view.effective.proteinG }),
        },
        {
          label: t('today.settings.targetExplain.carbs'),
          value: t('today.settings.grams.macros', { value: view.effective.carbsG }),
        },
        {
          label: t('today.settings.targetExplain.fat'),
          value: t('today.settings.grams.macros', { value: view.effective.fatG }),
        },
      ]
    : [];

  const sentence = view
    ? view.source === 'own'
      ? t('today.settings.targetExplain.own')
      : explainKcalSentence(view.inputs)
    : undefined;

  const footnote = view
    ? [explainProteinSentence(view.inputs), explainCarbsFatSentence()].join(' ')
    : undefined;

  return (
    <ExplainSheet
      visible={visible}
      onClose={onClose}
      eyebrow={t('today.settings.targetExplain.eyebrow')}
      title={t('today.settings.targetExplain.title')}
      sentence={sentence}
      rows={rows}
      footnote={footnote}
      testID={testID ?? 'target-explain-sheet'}
      action={{
        label:
          view?.source === 'own'
            ? t('today.settings.targetExplain.useSuggested')
            : t('today.settings.targetExplain.setOwn'),
        onPress: () => {
          onClose();
          router.push('/preferences');
        },
      }}
    />
  );
}
