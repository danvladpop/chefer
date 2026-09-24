import { ChipGroup } from '@chefer/ui-mobile';
import { WEEKDAY_SHORT_LABELS } from './weekday';

// A day's planned weekday: Mon–Sun, or "None" (gym_plan.md §1.3 setup / §5.4
// editor). -1 stands in for "no fixed day" so the whole row is a single
// single-choice ChipGroup (no separate clear affordance to keep in sync).
const NONE = -1;

const OPTIONS = [
  { value: NONE, label: 'None' },
  ...WEEKDAY_SHORT_LABELS.map((label, i) => ({ value: i, label })),
];

export interface WeekdayPickerProps {
  value: number | null;
  onChange: (value: number | null) => void;
  testID?: string;
}

export function WeekdayPicker({ value, onChange, testID }: WeekdayPickerProps) {
  return (
    <ChipGroup
      testID={testID}
      options={OPTIONS.map((o) => ({
        ...o,
        testID: testID
          ? `${testID}-${o.value === NONE ? 'none' : o.label.toLowerCase()}`
          : undefined,
      }))}
      value={[value ?? NONE]}
      onChange={(next) => {
        const picked = next[0];
        onChange(picked === undefined || picked === NONE ? null : picked);
      }}
    />
  );
}
