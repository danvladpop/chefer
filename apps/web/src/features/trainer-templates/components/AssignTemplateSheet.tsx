'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { capture } from '@/lib/analytics';
import { showAppToast } from '@/lib/app-toast';
import { useT } from '@/lib/i18n';
import { trpc } from '@/lib/trpc';
import { Search } from 'lucide-react';
import {
  TRAINER_MODE_LIMITS,
  type AssignTarget,
  type ClientRowDto,
  type WorkoutTemplateDto,
  type WorkoutTemplateTargetsResultDto,
} from '@chefer/types';
import { Button, buttonVariants, Sheet } from '@chefer/ui';
import {
  assignClientRoutine,
  assignTargetFor,
  canAssignAddDay,
  canAssignReplaceDay,
  cn,
  defaultAssignChoice,
  filterClients,
  userFacingErrorMessage,
  type AssignChoice,
  type AssignClientRoutine,
} from '@chefer/utils';
import { NEW_TEMPLATE_ID } from '../template-draft';
import { TuneWeightsStep, type TuneClient } from './TuneWeightsStep';

// ─── Assign a template (trainer-mode.md §6.6, M2) ─────────────────────────────
// From the template ("Assign to clients") or from a client ("Assign a
// template": pick the template first, that client already ticked). For each
// picked client: add it as a new day (optionally on a weekday, for a My week
// client) or replace one of their days. Then the per-client results, and
// "Set weights for each client" one client at a time.

/** `common.weekdays` keys, Monday first (0 = Monday, as `plannedWeekday`). */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

type Step = 'template' | 'clients' | 'results' | 'tune';

const selectCls =
  'h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-base focus:border-gray-400 focus:outline-none disabled:opacity-50 sm:text-sm';

function ClientTargetFields({
  client,
  info,
  choice,
  onChange,
}: {
  client: ClientRowDto;
  info: AssignClientRoutine;
  choice: AssignChoice;
  onChange: (choice: AssignChoice) => void;
}) {
  const { t } = useT();
  const id = useId();
  const addable = canAssignAddDay(info);
  const days = info.state === 'ready' ? info.days : [];
  return (
    <fieldset
      className="flex min-w-0 flex-col gap-2 rounded-xl border border-gray-200 p-3"
      data-testid="assign-client-target"
    >
      <legend className="px-1 text-sm font-semibold text-gray-900">{client.name}</legend>
      {info.state === 'loading' && (
        <div className="h-11 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
      )}
      {info.state === 'error' && (
        <p role="alert" className="text-sm text-red-700">
          {t('trainer.templates.assign.routineError')}
        </p>
      )}
      {info.state === 'none' && (
        <p className="text-sm text-gray-600">{t('trainer.templates.assign.noRoutine')}</p>
      )}
      {info.state === 'ready' && (
        <>
          <label className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name={`${id}-mode`}
              className="h-5 w-5"
              checked={choice.mode === 'ADD_DAY'}
              disabled={!addable}
              onChange={() => onChange({ ...choice, mode: 'ADD_DAY' })}
            />
            <span className="min-w-0">
              {t('trainer.templates.assign.addDay')}
              {!addable && (
                <span className="block text-xs text-gray-500">
                  {t('trainer.templates.assign.dayLimit')}
                </span>
              )}
            </span>
          </label>
          {choice.mode === 'ADD_DAY' && addable && (
            <div className="flex min-w-0 flex-col gap-1 pl-7">
              <label htmlFor={`${id}-weekday`} className="text-xs font-medium text-gray-700">
                {t('trainer.templates.assign.weekday')}
              </label>
              <select
                id={`${id}-weekday`}
                value={choice.weekday ?? ''}
                onChange={(e) =>
                  onChange({
                    ...choice,
                    weekday: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className={selectCls}
              >
                <option value="">{t('trainer.templates.assign.noWeekday')}</option>
                {WEEKDAY_KEYS.map((key, index) => (
                  <option key={key} value={index}>
                    {t(`common.weekdays.${key}`)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
            <input
              type="radio"
              name={`${id}-mode`}
              className="h-5 w-5"
              checked={choice.mode === 'REPLACE_DAY'}
              disabled={!canAssignReplaceDay(info)}
              onChange={() => onChange({ ...choice, mode: 'REPLACE_DAY' })}
            />
            {t('trainer.templates.assign.replaceDay')}
          </label>
          {choice.mode === 'REPLACE_DAY' && (
            <div className="flex min-w-0 flex-col gap-1 pl-7">
              <label htmlFor={`${id}-day`} className="text-xs font-medium text-gray-700">
                {t('trainer.templates.assign.pickDay')}
              </label>
              <select
                id={`${id}-day`}
                value={choice.routineDayId ?? ''}
                onChange={(e) => onChange({ ...choice, routineDayId: e.target.value || null })}
                className={selectCls}
              >
                <option value="" disabled>
                  {t('trainer.templates.assign.pickDayPlaceholder')}
                </option>
                {days.map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

export function AssignTemplateSheet({
  open,
  onClose,
  template,
  preselectedClientId,
}: {
  open: boolean;
  onClose: () => void;
  /** From the template screen; omitted from client detail (the trainer picks one first). */
  template?: WorkoutTemplateDto | null;
  /** From client detail: this client starts ticked. */
  preselectedClientId?: string;
}) {
  const { t } = useT();
  const utils = trpc.useUtils();
  const searchId = useId();
  const templatePickId = useId();
  const firstStep: Step = template ? 'clients' : 'template';
  const [step, setStep] = useState<Step>(firstStep);
  const [pickedTemplateId, setPickedTemplateId] = useState<string>('');
  const [selected, setSelected] = useState<string[]>(
    preselectedClientId ? [preselectedClientId] : [],
  );
  const [choices, setChoices] = useState<Record<string, AssignChoice>>({});
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<WorkoutTemplateTargetsResultDto | null>(null);

  // Every opening starts over.
  useEffect(() => {
    if (!open) return;
    setStep(firstStep);
    setPickedTemplateId('');
    setSelected(preselectedClientId ? [preselectedClientId] : []);
    setChoices({});
    setQuery('');
    setResult(null);
  }, [open, firstStep, preselectedClientId]);

  const today = localDate();
  const library = trpc.trainer.templates.list.useQuery(undefined, {
    enabled: open && !template,
    retry: false,
  });
  const pickedQuery = trpc.trainer.templates.get.useQuery(
    { templateId: pickedTemplateId || NEW_TEMPLATE_ID },
    { enabled: open && !template && pickedTemplateId !== '' && step !== 'template', retry: false },
  );
  const active = template ?? pickedQuery.data ?? null;

  const clients = trpc.trainer.clients.list.useQuery(
    { today },
    { enabled: open, retry: false, staleTime: 30_000 },
  );
  const rows = useMemo(() => clients.data ?? [], [clients.data]);
  const searchable = rows.length >= TRAINER_MODE_LIMITS.clientSearchFrom;
  const shown = searchable ? filterClients(rows, query) : rows;

  const routineQueries = trpc.useQueries((q) =>
    (open ? selected : []).map((clientId) =>
      q.trainer.client.routine({ clientId, today }, { retry: false, staleTime: 15_000 }),
    ),
  );
  const infoById = new Map<string, AssignClientRoutine>(
    selected.map((clientId, i) => {
      const q = routineQueries[i];
      return [
        clientId,
        q
          ? assignClientRoutine({ isLoading: q.isLoading, isError: q.isError, data: q.data })
          : { state: 'loading' },
      ];
    }),
  );
  const choiceOf = (clientId: string): AssignChoice =>
    choices[clientId] ?? defaultAssignChoice(infoById.get(clientId) ?? { state: 'loading' });

  const targets = selected
    .map((clientId) =>
      assignTargetFor(clientId, choiceOf(clientId), infoById.get(clientId) ?? { state: 'loading' }),
    )
    .filter((target): target is AssignTarget => target !== null);

  const assign = trpc.trainer.templates.assign.useMutation({
    meta: { silent: true },
    onSuccess: (res, input) => {
      setResult(res);
      setStep('results');
      const ok = res.results.filter((r) => r.ok).length;
      const failed = res.results.length - ok;
      if (ok > 0) capture('template_assigned', { clients: ok });
      showAppToast(
        failed === 0
          ? { message: t('trainer.templates.assign.done', { count: ok }), type: 'success' }
          : {
              message:
                ok > 0
                  ? t('trainer.templates.assign.partial', {
                      done: t('trainer.templates.assign.done', { count: ok }),
                      failed: t('trainer.templates.assign.failed', { count: failed }),
                    })
                  : t('trainer.templates.assign.failed', { count: failed }),
            },
      );
      void utils.trainer.templates.get.invalidate({ templateId: input.templateId });
      void utils.trainer.templates.list.invalidate();
      void utils.trainer.clients.list.invalidate();
      for (const r of res.results) {
        if (r.ok) void utils.trainer.client.routine.invalidate({ clientId: r.clientId });
      }
    },
    onError: (err) => showAppToast({ message: userFacingErrorMessage(err) }),
  });

  const nameOf = (clientId: string) => rows.find((c) => c.clientId === clientId)?.name ?? '';
  const toggle = (clientId: string, on: boolean) =>
    setSelected((prev) =>
      on
        ? [...prev.filter((id) => id !== clientId), clientId]
        : prev.filter((id) => id !== clientId),
    );

  const okResults = (result?.results ?? []).flatMap((r) => (r.ok ? [r] : []));
  const failedResults = (result?.results ?? []).flatMap((r) => (r.ok ? [] : [r]));
  const tuneClients: TuneClient[] = okResults.map((r) => ({
    clientId: r.clientId,
    name: nameOf(r.clientId),
    routineDayId: r.routineDayId,
  }));

  const title =
    step === 'template' || !active
      ? t('trainer.templates.assign.fromClient')
      : step === 'tune'
        ? t('trainer.templates.tune.title')
        : t('trainer.templates.assign.title', { template: active.name });

  let body: React.ReactNode;
  let footer: React.ReactNode;

  if (step === 'template') {
    const templates = library.data ?? [];
    body = (
      <div className="flex flex-col gap-3 px-5 py-4">
        {library.isLoading ? (
          <div className="h-11 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
        ) : templates.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">{t('trainer.templates.library.emptyBody')}</p>
            <Link
              href={`/trainer/workouts/${NEW_TEMPLATE_ID}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 self-start')}
            >
              {t('trainer.templates.library.newTemplate')}
            </Link>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={templatePickId} className="text-sm font-medium text-gray-700">
              {t('trainer.templates.assign.pickTemplate')}
            </label>
            <select
              id={templatePickId}
              value={pickedTemplateId}
              onChange={(e) => setPickedTemplateId(e.target.value)}
              className={selectCls}
            >
              <option value="" disabled>
                {t('trainer.templates.assign.pickTemplatePlaceholder')}
              </option>
              {templates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
    footer = (
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.actions.cancel')}
        </Button>
        <Button type="button" disabled={pickedTemplateId === ''} onClick={() => setStep('clients')}>
          {t('trainer.templates.assign.next')}
        </Button>
      </div>
    );
  } else if (step === 'clients') {
    body = (
      <div className="flex flex-col gap-4 px-5 py-4">
        {clients.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600">{t('trainer.templates.assign.noClients')}</p>
        ) : (
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold text-gray-900">
              {t('trainer.templates.assign.pickClients')}
            </legend>
            {searchable && (
              <div className="relative min-w-0">
                <label htmlFor={searchId} className="sr-only">
                  {t('trainer.clients.search')}
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden="true"
                />
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  placeholder={t('trainer.clients.search')}
                  autoComplete="off"
                  enterKeyHint="search"
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
                />
              </div>
            )}
            <ul className="flex flex-col">
              {shown.map((client) => (
                <li key={client.clientId}>
                  <label className="flex min-h-11 items-center gap-3 text-sm text-gray-900">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={selected.includes(client.clientId)}
                      onChange={(e) => toggle(client.clientId, e.target.checked)}
                    />
                    <span className="min-w-0 break-words">{client.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {selected.length > 0 && rows.length > 0 && (
          <div className="flex flex-col gap-3">
            {selected.map((clientId) => {
              const client = rows.find((c) => c.clientId === clientId);
              if (!client) return null;
              return (
                <ClientTargetFields
                  key={clientId}
                  client={client}
                  info={infoById.get(clientId) ?? { state: 'loading' }}
                  choice={choiceOf(clientId)}
                  onChange={(choice) => setChoices((prev) => ({ ...prev, [clientId]: choice }))}
                />
              );
            })}
          </div>
        )}
      </div>
    );
    footer = (
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={assign.isPending}>
          {t('common.actions.cancel')}
        </Button>
        <Button
          type="button"
          disabled={targets.length === 0 || !active}
          loading={assign.isPending}
          onClick={() => active && assign.mutate({ templateId: active.id, targets })}
        >
          {t('trainer.templates.assign.confirm', { count: targets.length })}
        </Button>
      </div>
    );
  } else if (step === 'results') {
    body = (
      <div className="flex flex-col gap-3 px-5 py-4" data-testid="assign-results">
        {okResults.length > 0 && (
          <p className="text-sm font-medium text-gray-900">
            {t('trainer.templates.assign.done', { count: okResults.length })}
          </p>
        )}
        {failedResults.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-red-700">
              {t('trainer.templates.assign.failed', { count: failedResults.length })}
            </p>
            <ul className="flex flex-col gap-1" data-testid="assign-failures">
              {failedResults.map((r) => (
                <li key={r.clientId} className="min-w-0 break-words text-sm text-gray-700">
                  {t('trainer.templates.assign.failureLine', {
                    name: nameOf(r.clientId) || r.clientId,
                    reason: t(`trainer.templates.assign.failureReason.${r.reason}`),
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
    footer = (
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('trainer.templates.tune.done')}
        </Button>
        {tuneClients.length > 0 && (
          <Button type="button" onClick={() => setStep('tune')}>
            {t('trainer.templates.assign.tune')}
          </Button>
        )}
      </div>
    );
  } else {
    body = null;
    footer = null;
  }

  return (
    <Sheet open={open} onClose={onClose} title={title} size="lg" footer={footer ?? undefined}>
      {step === 'tune' && active ? (
        <TuneWeightsStep template={active} clients={tuneClients} onDone={onClose} />
      ) : (
        body
      )}
    </Sheet>
  );
}
