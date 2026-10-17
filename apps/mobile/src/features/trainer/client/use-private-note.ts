import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from '../../../lib/trpc';

// The trainer's private note about one client: one free-text note, autosaved (spec §2.5). The text is
// opaque: it is never parsed, logged, put in analytics, an error message or a toast, and it is saved with
// an imperative client call (no mutation cache entry, no default error snackbar that could echo it).
// "Only you can see this. Chefer doesn't read it, and Maria never sees it."

export const NOTE_AUTOSAVE_MS = 1000;

export type NoteStatus = 'idle' | 'saving' | 'saved' | 'error';

export type PrivateNote = {
  /** The first load is still in flight. */
  isLoading: boolean;
  loadFailed: boolean;
  body: string;
  status: NoteStatus;
  onChange: (text: string) => void;
  /** Saves now (blur, Retry). */
  flush: () => Promise<void>;
  reload: () => void;
};

export function usePrivateNote(clientId: string): PrivateNote {
  const utils = trpc.useUtils();
  const query = trpc.trainer.client.note.useQuery({ clientId });
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<NoteStatus>('idle');
  const seeded = useRef(false);
  const latest = useRef('');
  const lastSaved = useRef('');
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (seeded.current || !query.isSuccess) return;
    seeded.current = true;
    const loaded = query.data?.body ?? '';
    lastSaved.current = loaded;
    latest.current = loaded;
    setBody(loaded);
  }, [query.isSuccess, query.data]);

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!seeded.current || saving.current || latest.current === lastSaved.current) return;
    const value = latest.current;
    saving.current = true;
    setStatus('saving');
    try {
      const saved = await utils.client.trainer.client.saveNote.mutate({ clientId, body: value });
      lastSaved.current = value;
      utils.trainer.client.note.setData({ clientId }, value === '' ? null : saved);
      setStatus('saved');
    } catch {
      setStatus('error');
      saving.current = false;
      return;
    }
    saving.current = false;
    // Typed more while the request was in flight: save that too.
    if (latest.current !== lastSaved.current) await flush();
  }, [utils, clientId]);

  const onChange = useCallback(
    (text: string) => {
      latest.current = text;
      setBody(text);
      setStatus('idle');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), NOTE_AUTOSAVE_MS);
    },
    [flush],
  );

  // Leaving the screen with an unsaved edit saves it.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (seeded.current && latest.current !== lastSaved.current) void flush();
    },
    [flush],
  );

  return {
    isLoading: query.isPending && !query.isError,
    loadFailed: query.isError,
    body,
    status,
    onChange,
    flush,
    reload: () => void query.refetch(),
  };
}
