'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import {
  CHECK_IN_COPY,
  CHECK_IN_LIMITS,
  CHECK_IN_QUESTIONS,
  type CheckInAnswers,
  type CheckInQuestion,
} from '@chefer/types';
import { Button } from '@chefer/ui';
import { cn, isCompleteCheckIn, userFacingErrorMessage } from '@chefer/utils';

// ─── /coaching/check-in (lane K3) ─────────────────────────────────────────────
// The trainer's questions as 1–5 radio groups and an optional note. Sending
// again changes the answers until the next check-in opens. The note is never
// sent to analytics (the event carries counts). Mirrors mobile check-in-screen.tsx.

function ScaleRow({
  question,
  value,
  onChange,
  disabled,
}: {
  question: CheckInQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const id = useId();
  const q = CHECK_IN_QUESTIONS[question];
  return (
    <fieldset className="flex flex-col gap-1.5" data-testid={`check-in-${question}`}>
      <legend id={`${id}-legend`} className="text-sm font-semibold text-gray-900">
        {q.label}
      </legend>
      <div role="radiogroup" aria-labelledby={`${id}-legend`} className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={CHECK_IN_COPY.client.scaleLabel(q.label, n)}
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              'min-h-11 min-w-0 flex-1 rounded-lg border text-base font-semibold',
              value === n
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>{q.low}</span>
        <span>{q.high}</span>
      </div>
    </fieldset>
  );
}

export function CheckInForm() {
  const copy = CHECK_IN_COPY.client;
  const router = useRouter();
  const utils = trpc.useUtils();
  const noteId = useId();
  const today = localDate();
  const current = trpc.coaching.checkIn.current.useQuery({ today }, { retry: false });
  const [answers, setAnswers] = useState<CheckInAnswers>({});
  const [note, setNote] = useState('');
  useEffect(() => {
    if (current.data?.answered) {
      setAnswers(current.data.answered.answers);
      setNote(current.data.answered.note ?? '');
    }
  }, [current.data]);
  const submit = trpc.coaching.checkIn.submit.useMutation({
    meta: { silent: true },
    onSuccess: (sent) => {
      capture('check_in_submitted', {
        questions: sent.questions.length,
        withNote: (sent.answered?.note ?? '') !== '',
        edit: current.data?.answered != null,
      });
      void utils.coaching.checkIn.current.invalidate();
      showAppToast({ message: copy.sent(sent.trainerName), type: 'success' });
      router.push('/gym');
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6 sm:px-6">
      <h1 className="font-serif text-2xl font-bold text-gray-900">{copy.title}</h1>
      {current.isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />
      ) : current.isError ? (
        <p role="alert" className="text-sm text-gray-700">
          {userFacingErrorMessage(current.error)}
        </p>
      ) : !current.data ? (
        <p className="text-sm text-gray-700" data-testid="check-in-closed">
          {copy.closed}
        </p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const open = current.data;
            if (!open) return;
            submit.mutate({
              today,
              periodStart: open.periodStart,
              answers,
              ...(note.trim() !== '' && { note: note.trim() }),
              source: 'web',
            });
          }}
        >
          <p className="text-sm text-gray-700">{copy.intro(current.data.trainerName)}</p>
          <div className="flex flex-col gap-5 rounded-2xl border bg-white p-4 shadow-sm">
            {current.data.questions.map((q) => (
              <ScaleRow
                key={q}
                question={q}
                value={answers[q]}
                disabled={submit.isPending}
                onChange={(v) => setAnswers((cur) => ({ ...cur, [q]: v }))}
              />
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={noteId} className="text-sm font-semibold text-gray-900">
              {copy.noteLabel}
            </label>
            <textarea
              id={noteId}
              value={note}
              maxLength={CHECK_IN_LIMITS.noteMaxChars}
              placeholder={copy.notePlaceholder}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-28 rounded-lg border border-gray-200 px-3 py-2 text-base sm:text-sm"
            />
          </div>
          {submit.error && (
            <p role="alert" className="text-sm text-red-700">
              {userFacingErrorMessage(submit.error)}
            </p>
          )}
          {!isCompleteCheckIn(current.data.questions, answers) && (
            <p className="text-xs text-gray-600">{copy.needsAll}</p>
          )}
          <Button
            type="submit"
            className="min-h-11"
            loading={submit.isPending}
            disabled={!isCompleteCheckIn(current.data.questions, answers)}
          >
            {current.data.answered ? copy.edit : copy.send}
          </Button>
        </form>
      )}
    </div>
  );
}
