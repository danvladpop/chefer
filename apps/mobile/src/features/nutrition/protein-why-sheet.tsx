import type { ProteinWhy } from '@chefer/types';
import { ExplainSheet } from '@chefer/ui-mobile';

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
  const rows = why
    ? [
        { label: 'Protein a day', value: `${why.effectiveG} g` },
        ...(why.gPerKg !== null
          ? [{ label: 'Per kg of bodyweight', value: `${why.gPerKg} g` }]
          : []),
        ...(why.differs && why.referenceG !== null
          ? [{ label: `At ${why.referenceGPerKg} g per kg`, value: `${why.referenceG} g` }]
          : []),
      ]
    : [];
  return (
    <ExplainSheet
      visible={visible}
      onClose={onClose}
      eyebrow="Your protein"
      title="Why this protein number?"
      {...(why ? { sentence: why.sentence } : {})}
      rows={rows}
      testID={testID ?? 'protein-why-sheet'}
      {...(action ? { action } : {})}
    />
  );
}
