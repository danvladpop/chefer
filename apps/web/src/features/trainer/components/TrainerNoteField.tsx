'use client';

import { useId } from 'react';
import { COACHING_COPY, COACHING_LIMITS } from '@chefer/types';
import { cn } from '@chefer/utils';

/**
 * "Note for Maria": the short cue the client sees under the exercise (max 200
 * characters). The limit is shown, not enforced by the field, so a paste is never
 * silently cut: past the limit the error is linked to the field and Save waits.
 */
export function TrainerNoteField({
  clientName,
  value,
  onChange,
}: {
  clientName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const copy = COACHING_COPY.trainer;
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const max = COACHING_LIMITS.trainerNoteMaxChars;
  const tooLong = value.length > max;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {copy.noteForClient(clientName)}
      </label>
      <textarea
        id={id}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={tooLong ? true : undefined}
        aria-describedby={tooLong ? `${hintId} ${errorId}` : hintId}
        className={cn(
          'w-full min-w-0 resize-y rounded-md border px-2 py-1.5 text-base focus:outline-none sm:text-sm',
          tooLong ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-gray-400',
        )}
      />
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p id={hintId} className="min-w-0 text-xs text-gray-500">
          {copy.noteForClientHint(clientName)}
        </p>
        <p className={cn('shrink-0 text-xs', tooLong ? 'text-red-700' : 'text-gray-500')}>
          {value.length} / {max}
        </p>
      </div>
      {tooLong && (
        <p id={errorId} role="alert" className="text-xs text-red-700">
          Keep the note to {max} characters or fewer.
        </p>
      )}
    </div>
  );
}
