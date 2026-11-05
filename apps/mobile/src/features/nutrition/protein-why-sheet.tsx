import type { ProteinWhy } from '@chefer/types';
import { ExplainSheet } from '@chefer/ui-mobile';
import { useT } from '../../lib/i18n';
import { useNumbersMode } from '../numbers-mode/numbers-mode';

// ─── ProteinWhySheet (WP-08, D-5) ───────────────────────────────────────────────
// "Why this protein number?" The sentence comes from the API's `proteinWhy`
// (targets.get → explainProteinTarget), so the wording matches web's. It names
// the user's effective target and, when it is not ~1.6 g per kg, why. Shared
// ExplainSheet (PAT-1); the action only changes an input, never upsells.

export interface ProteinWhySheetProps {
  visible: boolean;
  onClose: () => void;
  /** `targets.get`'s `proteinWhy` — omitted while it is still loading. */
  why: ProteinWhy | undefined;
  /** Changes an input (never an upsell). Omitted where the user is already on the targets. */
  action?: { label: string; onPress: () => void } | undefined;
  testID?: string;
}

export function ProteinWhySheet({ visible, onClose, why, action, testID }: ProteinWhySheetProps) {
  // Lane E3 "Hide numbers": the protein target is never explained in figures.
  const { noNumbers } = useNumbersMode();
  const { t } = useT();
  const rows = why
    ? [
        {
          label: t('today.settings.proteinWhy.perDay'),
          value: t('today.settings.grams.protein', { value: why.effectiveG }),
        },
        ...(why.gPerKg !== null
          ? [
              {
                label: t('today.settings.proteinWhy.perKg'),
                value: t('today.settings.grams.protein', { value: why.gPerKg }),
              },
            ]
          : []),
        ...(why.differs && why.referenceG !== null
          ? [
              {
                label: t('today.settings.proteinWhy.atReference', {
                  value: why.referenceGPerKg,
                }),
                value: t('today.settings.grams.protein', { value: why.referenceG }),
              },
            ]
          : []),
      ]
    : [];
  if (noNumbers) return null;
  return (
    <ExplainSheet
      visible={visible}
      onClose={onClose}
      eyebrow={t('today.settings.proteinWhy.eyebrow')}
      title={t('today.settings.proteinWhy.title')}
      {...(why ? { sentence: why.sentence } : {})}
      rows={rows}
      testID={testID ?? 'protein-why-sheet'}
      {...(action ? { action } : {})}
    />
  );
}
