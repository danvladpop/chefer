import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkoutTemplateDto } from '@chefer/types';
import { hasTemplateContent, isTemplateSavable, templateConflictCurrent } from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { routineDraftReducer, type RoutineDraftAction } from '../../gym/routine/reducer';
import type { RoutineDraft } from '../../gym/routine/types';
import {
  adoptServerRowIds,
  draftToTemplateDoc,
  emptyTemplateDraft,
  templateDtoToDraft,
  templateSignature,
} from './template-draft';

// ─── The template editor's state and autosave (trainer-mode.md §6.6) ─────────
// Edits go through the routine reducer; a debounced autosave writes them, version-checked like a
// routine. A new template ("/trainer/templates/new") is created on the first save that has a name, so
// opening New template and backing out leaves nothing in the library. One request at a time: edits
// made while a save is in flight are saved right after it. A stale version is CONFLICT: autosave pauses
// and the screen shows the "Keep mine / Use the other version" sheet.

export const TEMPLATE_AUTOSAVE_MS = 800;

export type TemplateSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type TemplateEditor = {
  /** The template's id once it exists (null for a new template not saved yet). */
  templateId: string | null;
  /** Loading an existing template (no draft yet). */
  isLoading: boolean;
  loadError: unknown;
  retryLoad: () => void;
  /** The server's latest copy (assignments, outdated counts), when there is one. */
  server: WorkoutTemplateDto | null;
  draft: RoutineDraft;
  dispatch: (action: RoutineDraftAction) => void;
  status: TemplateSaveStatus;
  /** Edits that are not saved yet (pending, in flight, failed or waiting for a name). */
  hasUnsavedEdits: boolean;
  conflict: WorkoutTemplateDto | null;
  keepMine: () => void;
  loadTheirs: () => void;
  /** Saves now (Retry, before assigning). Resolves true when everything is saved. */
  flush: () => Promise<boolean>;
  /** Stops autosaving for good (the template is being deleted). */
  stop: () => void;
};

export function useTemplateEditor(initialId: string | null): TemplateEditor {
  const utils = trpc.useUtils();
  const [templateId, setTemplateId] = useState<string | null>(initialId);
  const query = trpc.trainer.templates.get.useQuery(
    { templateId: templateId ?? '' },
    { enabled: templateId !== null, staleTime: 0, retry: false },
  );
  const [draft, setDraftState] = useState<RoutineDraft>(emptyTemplateDraft);
  const [status, setStatus] = useState<TemplateSaveStatus>('idle');
  const [conflict, setConflict] = useState<WorkoutTemplateDto | null>(null);
  const [server, setServer] = useState<WorkoutTemplateDto | null>(null);

  const latest = useRef<RoutineDraft>(draft);
  const lastSaved = useRef<string>(templateSignature(draft));
  const idRef = useRef<string | null>(initialId);
  const loaded = useRef(initialId === null);
  const saving = useRef(false);
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDraft = useCallback((next: RoutineDraft) => {
    latest.current = next;
    setDraftState(next);
  }, []);

  const rememberServer = useCallback(
    (dto: WorkoutTemplateDto) => {
      setServer(dto);
      utils.trainer.templates.get.setData({ templateId: dto.id }, dto);
    },
    [utils],
  );

  // Seed once from data fetched NOW: a cached copy may carry an old version (a phantom conflict).
  useEffect(() => {
    if (loaded.current || !query.data || !query.isFetchedAfterMount) return;
    loaded.current = true;
    const seeded = templateDtoToDraft(query.data);
    lastSaved.current = templateSignature(seeded);
    setDraft(seeded);
    setServer(query.data);
  }, [query.data, query.isFetchedAfterMount, setDraft]);

  // Assign / Update for clients refetch `get`: keep the assignments list current.
  useEffect(() => {
    if (loaded.current && query.data && query.data.version >= latest.current.version) {
      setServer(query.data);
    }
  }, [query.data]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const current = latest.current;
    const signature = templateSignature(current);
    if (!loaded.current || paused.current) return false;
    if (signature === lastSaved.current) return !saving.current;
    if (saving.current || !isTemplateSavable(draftToTemplateDoc(current))) return false;
    // No empty templates in the library: the first save waits for a name plus an exercise or a type.
    if (idRef.current === null && !hasTemplateContent(draftToTemplateDoc(current))) return false;

    saving.current = true;
    setStatus('saving');
    const doc = draftToTemplateDoc(current);
    const sentKeys = (current.days[0]?.exercises ?? []).map((e) => e.key);
    try {
      const id = idRef.current;
      const dto =
        id === null
          ? await utils.client.trainer.templates.create.mutate(doc)
          : await utils.client.trainer.templates.save.mutate({
              templateId: id,
              template: doc,
              expectedVersion: current.version,
            });
      if (id === null) {
        idRef.current = dto.id;
        setTemplateId(dto.id);
        track('template_created', {});
      }
      lastSaved.current = signature;
      setDraft(adoptServerRowIds(latest.current, sentKeys, dto));
      rememberServer(dto);
      void utils.trainer.templates.list.invalidate();
      setStatus('saved');
    } catch (error) {
      saving.current = false;
      const theirs = templateConflictCurrent(error);
      if (theirs) {
        paused.current = true;
        setConflict(theirs);
        setStatus('idle');
      } else {
        setStatus('error');
      }
      return false;
    }
    saving.current = false;
    // Edited while the request was in flight: save that too.
    if (templateSignature(latest.current) !== lastSaved.current) return flush();
    return true;
  }, [utils, rememberServer, setDraft]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), TEMPLATE_AUTOSAVE_MS);
  }, [flush]);

  const dispatch = useCallback(
    (action: RoutineDraftAction) => {
      const next = routineDraftReducer(latest.current, action);
      if (next === latest.current) return;
      setDraft(next);
      setStatus((s) => (s === 'saving' ? s : 'idle'));
      schedule();
    },
    [schedule, setDraft],
  );

  const keepMine = useCallback(() => {
    if (!conflict) return;
    // Re-save the same edits on the newer version.
    setDraft({ ...latest.current, version: conflict.version });
    lastSaved.current = '';
    paused.current = false;
    setConflict(null);
    void flush();
  }, [conflict, flush, setDraft]);

  const loadTheirs = useCallback(() => {
    if (!conflict) return;
    const next = templateDtoToDraft(conflict);
    lastSaved.current = templateSignature(next);
    setDraft(next);
    rememberServer(conflict);
    paused.current = false;
    setConflict(null);
    setStatus('idle');
  }, [conflict, rememberServer, setDraft]);

  const stop = useCallback(() => {
    paused.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    lastSaved.current = templateSignature(latest.current);
  }, []);

  // Leaving the screen with a pending edit saves it.
  useEffect(() => {
    const pending = timer;
    return () => {
      if (pending.current) clearTimeout(pending.current);
      if (loaded.current && templateSignature(latest.current) !== lastSaved.current) void flush();
    };
  }, [flush]);

  const hasUnsavedEdits = templateSignature(draft) !== lastSaved.current || status === 'saving';

  return {
    templateId,
    isLoading: initialId !== null && !loaded.current && !query.isError,
    loadError: query.error,
    retryLoad: () => void query.refetch(),
    server,
    draft,
    dispatch,
    status,
    hasUnsavedEdits,
    conflict,
    keepMine,
    loadTheirs,
    flush,
    stop,
  };
}
