import { useEffect } from 'react';
import type { FieldErrors, UseFormTrigger, UseFormWatch } from 'react-hook-form';

type ConfirmForm = { password: string; confirmPassword: string };

export const PASSWORDS_MISMATCH_MESSAGE = 'Passwords do not match';

/**
 * UX-ACC-16 (builds on B-25): "Passwords do not match" must never stay on
 * screen under two identical passwords. react-hook-form only re-validates the
 * field that changed and the refine's error lives on `confirmPassword`, so:
 *  - editing EITHER field re-runs the confirm check while an error is showing, and
 *  - the message is also hidden whenever the live values already match, so a
 *    stale error cannot render even if a re-validation is skipped (autofill
 *    fills both fields in one go).
 * Returns the confirm error text to show.
 */
export function useConfirmPasswordError<T extends ConfirmForm>(
  watch: UseFormWatch<T>,
  trigger: UseFormTrigger<T>,
  errors: FieldErrors<T>,
): string | undefined {
  // The generics can't prove `T` has these keys to react-hook-form's path
  // types, so read them through the ConfirmForm view.
  const view = watch as unknown as UseFormWatch<ConfirmForm>;
  const retrigger = trigger as unknown as UseFormTrigger<ConfirmForm>;
  const password = view('password');
  const confirm = view('confirmPassword');

  const message = (errors as FieldErrors<ConfirmForm>).confirmPassword?.message;

  // Only while an error is showing: validating on every keystroke would flag
  // the confirmation as "not matching" before the user has finished typing it.
  const hasError = message !== undefined;
  useEffect(() => {
    if (confirm && hasError) void retrigger('confirmPassword');
    // Only the two values drive this; `retrigger` is stable per form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, confirm]);

  if (message === PASSWORDS_MISMATCH_MESSAGE && password === confirm) return undefined;
  return message;
}
