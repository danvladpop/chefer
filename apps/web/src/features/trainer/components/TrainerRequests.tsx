'use client';

import { useState } from 'react';
import { formatShortDay } from '@/features/coaching/lib/dates';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, type TrainerRequestDto } from '@chefer/types';
import { Button } from '@chefer/ui';
import { userFacingErrorMessage } from '@chefer/utils';

// ─── Clients → Requests (PRD 2026-10 §4.1) ────────────────────────────────────
// Coaching requests from clients, oldest first. Accept starts the coaching (a
// client who has a trainer switches on accept); Decline tells the client. An
// error stays on its own row.

const copy = COACHING_COPY.request;

function RequestRow({
  request,
  busy,
  error,
  onAnswer,
}: {
  request: TrainerRequestDto;
  busy: 'accept' | 'decline' | null;
  error: string | null;
  onAnswer: (answer: 'accept' | 'decline') => void;
}) {
  return (
    <li
      className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
      data-testid="trainer-request-row"
    >
      <div className="min-w-0">
        <p className="min-w-0 break-words font-medium text-gray-900">
          {copy.fromClient(request.client.name)}
        </p>
        <p className="text-xs text-gray-500">{copy.expires(formatShortDay(request.expiresAt))}</p>
        {request.hasTrainer && <p className="mt-1 text-sm text-amber-800">{copy.hasTrainer}</p>}
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          loading={busy === 'accept'}
          disabled={busy !== null}
          aria-label={`${copy.accept}: ${request.client.name}`}
          onClick={() => onAnswer('accept')}
        >
          {copy.accept}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          loading={busy === 'decline'}
          disabled={busy !== null}
          aria-label={`${copy.decline}: ${request.client.name}`}
          onClick={() => onAnswer('decline')}
        >
          {copy.decline}
        </Button>
      </div>
    </li>
  );
}

export function TrainerRequests() {
  const utils = trpc.useUtils();
  const requests = trpc.trainer.requests.list.useQuery(undefined, {
    retry: false,
    staleTime: 30_000,
  });
  const [busy, setBusy] = useState<{ id: string; answer: 'accept' | 'decline' } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = () => {
    void utils.trainer.requests.list.invalidate();
    void utils.trainer.clients.list.invalidate();
    void utils.trainer.status.invalidate();
    void utils.coaching.notices.invalidate();
  };
  const settle = (id: string, error: string | null) => {
    setBusy(null);
    setErrors((prev) => {
      const rest = Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id));
      return error ? { ...rest, [id]: error } : rest;
    });
  };
  const accept = trpc.trainer.requests.accept.useMutation({ meta: { silent: true } });
  const decline = trpc.trainer.requests.decline.useMutation({ meta: { silent: true } });

  const answer = (request: TrainerRequestDto, choice: 'accept' | 'decline') => {
    setBusy({ id: request.id, answer: choice });
    const mutation = choice === 'accept' ? accept : decline;
    mutation.mutate(
      { requestId: request.id },
      {
        onSuccess: () => {
          settle(request.id, null);
          refresh();
          showAppToast({
            message: choice === 'accept' ? copy.accepted(request.client.name) : copy.declined,
            type: 'success',
          });
        },
        onError: (err) => {
          settle(request.id, userFacingErrorMessage(err));
          // A request that went away (cancelled, expired) leaves the list on refresh.
          void utils.trainer.requests.list.invalidate();
        },
      },
    );
  };

  const list = requests.data ?? [];
  if (list.length === 0) return null;

  return (
    <section
      id="trainer-requests"
      aria-labelledby="trainer-requests-title"
      className="flex scroll-mt-20 flex-col gap-2"
    >
      <h2 id="trainer-requests-title" className="font-semibold text-gray-900">
        {copy.listTitle}
      </h2>
      <ul className="flex flex-col gap-2" aria-label={copy.listTitle}>
        {list.map((r) => (
          <RequestRow
            key={r.id}
            request={r}
            busy={busy?.id === r.id ? busy.answer : null}
            error={errors[r.id] ?? null}
            onAnswer={(choice) => answer(r, choice)}
          />
        ))}
      </ul>
    </section>
  );
}
