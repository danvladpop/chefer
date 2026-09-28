import { ExplainSheet } from '@chefer/ui-mobile';

// UX-36 (4), T-36.4 remainder: the `How this works` ExplainSheet — reached
// from the Gym Today week card AND the Stats consistency legend, so both
// links must show the exact same four rows (kind mechanics, CI-51).
// ExplainSheet's `rows` are label/value pairs designed for short answers, so
// each mechanic is one row: the label is its name, the value its sentence.

const ROWS = [
  {
    label: 'Weeks, not days',
    value: 'Hit your weekly goal and your streak grows. Missing a session changes nothing.',
  },
  {
    label: 'Flex weeks',
    value: 'Every 4 weeks you earn a flex week — a short week won’t break your streak.',
  },
  {
    label: 'Pause',
    value: 'Going away or ill? Pause training and nothing counts against you.',
  },
  {
    label: 'Half sessions count',
    value: 'Any finished workout counts toward the week.',
  },
];

export interface HowThisWorksSheetProps {
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

export function HowThisWorksSheet({
  visible,
  onClose,
  testID = 'gym-how-this-works',
}: HowThisWorksSheetProps) {
  return (
    <ExplainSheet
      visible={visible}
      onClose={onClose}
      title="How this works"
      rows={ROWS}
      testID={testID}
    />
  );
}
