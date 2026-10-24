import { useId } from 'react';
import { COACHING_SHARING_COPY, type CoachingShareChoice } from '@chefer/types';
import { Switch } from '@chefer/ui';

// ─── "Share my food log" / "Share my weight" (lane K1) ────────────────────────
// The client's two opt-ins, on the consent screen (join and request) and in
// Your trainer. Consent copy from the shared COACHING_SHARING_COPY (mobile
// renders the same strings): do not reword here. The caller owns the value.

export interface SharingSwitchesProps {
  trainerName: string;
  value: CoachingShareChoice;
  onChange: (next: Partial<CoachingShareChoice>) => void;
  disabled?: boolean;
  testId?: string;
}

function SwitchRow({
  label,
  body,
  checked,
  onCheckedChange,
  disabled,
  testId,
}: {
  label: string;
  body: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled: boolean;
  testId: string;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p id={`${id}-label`} className="text-sm font-semibold text-gray-900">
          {label}
        </p>
        <p id={`${id}-body`} className="text-sm text-gray-600">
          {body}
        </p>
      </div>
      <Switch
        data-testid={testId}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-body`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function SharingSwitches({
  trainerName,
  value,
  onChange,
  disabled = false,
  testId = 'coaching-sharing',
}: SharingSwitchesProps) {
  const copy = COACHING_SHARING_COPY;
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <SwitchRow
        testId={`${testId}-food`}
        label={copy.food.label}
        body={copy.food.body(trainerName)}
        checked={value.food}
        disabled={disabled}
        onCheckedChange={(food) => onChange({ food })}
      />
      <SwitchRow
        testId={`${testId}-weight`}
        label={copy.weight.label}
        body={copy.weight.body(trainerName)}
        checked={value.weight}
        disabled={disabled}
        onCheckedChange={(weight) => onChange({ weight })}
      />
      <p className="text-xs text-gray-600">{copy.footer}</p>
    </div>
  );
}
