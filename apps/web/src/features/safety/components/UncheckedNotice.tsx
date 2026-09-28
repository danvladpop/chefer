'use client';

import { HelpCircle } from 'lucide-react';
import { conditionNoticeText, unrecognisedNoticeText } from '@chefer/utils';

// UX-01 "Something else" outcomes (§Flow (a)) + UX-22 T-22.1. Web parity of
// the mobile `unchecked-notice.tsx` — see that file's header comment for why
// the condition variant's copy lives in `@chefer/utils` rather than
// `wellness-copy.ts`.

export interface UncheckedNoticeProps {
  term: string;
  variant?: 'unrecognised' | 'condition';
  onKeepNote?: () => void;
  onRemove?: () => void;
  onChooseGoal?: () => void;
  onDismiss?: () => void;
}

export function UncheckedNotice({
  term,
  variant = 'unrecognised',
  onKeepNote,
  onRemove,
  onChooseGoal,
  onDismiss,
}: UncheckedNoticeProps) {
  const text = variant === 'condition' ? conditionNoticeText(term) : unrecognisedNoticeText(term);
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
    >
      <div className="flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
        <p className="min-w-0 text-sm text-amber-900">{text}</p>
      </div>
      <div className="flex gap-2">
        {variant === 'condition' ? (
          <>
            {onChooseGoal ? (
              <button
                type="button"
                onClick={onChooseGoal}
                className="min-h-11 flex-1 rounded-md border border-amber-300 bg-background px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                Choose a goal
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDismiss}
              className="min-h-11 flex-1 rounded-md px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              OK
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onKeepNote}
              className="min-h-11 flex-1 rounded-md border border-amber-300 bg-background px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Keep as a note
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="min-h-11 flex-1 rounded-md px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
