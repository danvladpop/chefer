import type { Ref } from 'react';
import { SafetyPicker, type SafetyPickerHandle } from '../../safety/safety-picker';
import type { SafetyValue } from '../types';

// SafetyStep (T-01.7) — thin wrapper over the shared SafetyPicker, kept as
// its own file/name so every existing caller (the Preferences screen, the
// onboarding wizard's diet step, and the household member editor) keeps its
// props unchanged. `SafetyValue` and `SafetyPicker`'s `SafetyPickerValue`
// are structurally identical (dietaryRestrictions/allergies/
// dislikedIngredients: string[]) — the flat storage contract this whole
// feature is built to keep unchanged (§2.1).

export interface SafetyStepProps {
  value: SafetyValue;
  onChange: (value: SafetyValue) => void;
  /** testID prefix (default 'prefs', matching the existing Preferences
      screen). No Maestro/RNTL flow currently pins the old ChipEditor's
      per-field ids (`prefs-restrictions` etc.), which this rebuild replaces
      with SafetyPicker's own group ids. */
  testIDPrefix?: string;
  /** UX-ACC-01: lets the host flush a typed-but-unadded "Something else" term on Save. */
  ref?: Ref<SafetyPickerHandle>;
  onPendingChange?: (pending: boolean) => void;
}

export function SafetyStep({
  value,
  onChange,
  testIDPrefix = 'prefs',
  ref,
  onPendingChange,
}: SafetyStepProps) {
  return (
    <SafetyPicker
      ref={ref}
      value={value}
      onChange={onChange}
      testIDPrefix={testIDPrefix}
      onPendingChange={onPendingChange}
    />
  );
}
