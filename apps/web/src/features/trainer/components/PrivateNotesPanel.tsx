'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { COACHING_COPY, COACHING_LIMITS } from '@chefer/types';

// ─── Private notes (spec §2.5) ────────────────────────────────────────────────
// One free-text note per client, autosaved. Opaque text: never logged, never sent
// to analytics, never shown in a toast or an error message.

const AUTOSAVE_MS = 800;

export function PrivateNotesPanel({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName: string;
}) {
  const copy = COACHING_COPY.trainer;
  const textId = useId();
  const hintId = useId();
  const utils = trpc.useUtils();
  const note = trpc.trainer.client.note.useQuery(
    { clientId },
    { retry: false, staleTime: Infinity },
  );
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [failed, setFailed] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (note.isSuccess && !loaded.current) {
      loaded.current = true;
      const body = note.data?.body ?? '';
      setValue(body);
      setSaved(body);
    }
  }, [note.isSuccess, note.data]);

  const save = trpc.trainer.client.saveNote.useMutation({
    meta: { silent: true },
    onSuccess: (result) => {
      setSaved(result.body);
      setFailed(false);
      utils.trainer.client.note.setData({ clientId }, result.body === '' ? null : result);
    },
    onError: () => setFailed(true),
  });

  useEffect(() => {
    if (!loaded.current || value === saved || save.isPending) return;
    const timer = window.setTimeout(() => save.mutate({ clientId, body: value }), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable per tRPC
  }, [value, saved, save.isPending, clientId]);

  // Leaving the page inside the autosave delay must not lose the last words.
  const latest = useRef({ value, saved });
  latest.current = { value, saved };
  useEffect(
    () => () => {
      const { value: v, saved: s } = latest.current;
      if (loaded.current && v !== s) save.mutate({ clientId, body: v });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flush once, on unmount
    [],
  );

  const status = failed
    ? 'Couldn’t save. We’ll try again when you type.'
    : value !== saved || save.isPending
      ? 'Saving…'
      : saved
        ? 'Saved'
        : '';

  return (
    <section
      className="flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm sm:p-5"
      data-testid="trainer-private-notes"
    >
      <label htmlFor={textId} className="font-semibold text-gray-900">
        {copy.privateNote}
      </label>
      <p id={hintId} className="text-xs text-gray-500">
        {copy.privateNoteHint(clientName)}
      </p>
      <textarea
        id={textId}
        aria-describedby={hintId}
        value={value}
        disabled={!note.isSuccess}
        maxLength={COACHING_LIMITS.noteMaxChars}
        rows={8}
        onChange={(e) => setValue(e.target.value)}
        className="w-full min-w-0 resize-y rounded-lg border border-gray-200 p-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
      />
      <p className="min-h-4 text-xs text-gray-500" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
