'use client';

import { useId, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, COACHING_LIMITS } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

/** Trainer tools → "Coach clients in Chefer": the display name clients see, then Turn on (spec §2.1). */
export function TrainerTurnOn({ defaultName }: { defaultName: string }) {
  const copy = COACHING_COPY.trainer;
  const utils = trpc.useUtils();
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  const activate = trpc.trainer.activate.useMutation({
    meta: { silent: true },
    onSuccess: () => {
      void utils.trainer.status.invalidate();
    },
    onError: (err) => setError(userFacingErrorMessage(err)),
  });

  const invalid = name.trim().length === 0;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{copy.turnOnTitle}</h1>
      <p className="mt-2 text-sm text-gray-600">{copy.turnOnBody}</p>
      <form
        className="mt-6 flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          setError(null);
          activate.mutate({ displayName: name.trim() });
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium text-gray-700">
            {copy.displayName}
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={COACHING_LIMITS.displayNameMaxChars}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
          />
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="min-h-11" disabled={invalid} loading={activate.isPending}>
          {copy.turnOn}
        </Button>
      </form>
    </div>
  );
}
