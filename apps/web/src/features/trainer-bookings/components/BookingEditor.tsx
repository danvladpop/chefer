'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { useTrainerStatus } from '@/features/trainer/use-trainer-status';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Search } from 'lucide-react';
import {
  BOOKING_COPY,
  BOOKING_DURATION_CHIPS,
  BOOKING_DURATION_LIMITS,
  COACHING_COPY,
  TRAINER_MODE_COPY,
  TRAINER_MODE_LIMITS,
  type BookingScope,
  type BookingWorkoutRef,
  type TrainerBookingDto,
} from '@chefer/types';
import { Button, pressControl, Sheet } from '@chefer/ui';
import {
  bookingDraftFrom,
  bookingOverlapWarnings,
  bookingWeekRange,
  cn,
  deviceTimeZone,
  filterClients,
  isChipDuration,
  maxRepeatUntil,
  newBookingDraft,
  toBookingPatch,
  toCreateBookingInput,
  userFacingErrorMessage,
  validateBookingDraft,
  weekStartOf,
  type BookingDraft,
  type BookingDraftClient,
} from '@chefer/utils';
import { useInvalidateBookings, useOnline } from '../use-bookings';
import { ScopeChoice } from './ScopeChoice';

// ─── Booking editor (trainer-mode.md §6.3) ────────────────────────────────────
// A Sheet (MO-02 via @chefer/ui): Type, Clients (searchable, max 6, hidden for
// blocked time), Date + Start (5-minute steps), Duration (chips or custom),
// Repeat (new bookings), Workout per client, Location (pre-filled from the gym
// line), Note. Overlaps warn but never block. Editing a repeating booking asks
// "This booking / This and following" before saving.

export type EditorTarget =
  | {
      mode: 'create';
      date: string;
      time: string;
      durationMin?: number;
      clients?: { clientId: string; name: string }[];
    }
  | { mode: 'edit'; booking: TrainerBookingDto };

const copy = BOOKING_COPY.editor;
const MAX_CLIENTS = TRAINER_MODE_LIMITS.clientsPerBooking;

const inputCls =
  'h-11 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-base focus:border-gray-400 focus:outline-none aria-[invalid=true]:border-red-500 sm:text-sm';
const labelCls = 'text-sm font-medium text-gray-800';

function chipCls(active: boolean) {
  return cn(
    'flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-medium',
    active
      ? 'border-gray-900 bg-gray-900 text-white'
      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
    // MO-01 press feedback.
    pressControl,
  );
}

/** `aria-describedby` from the ids that apply. */
const idList = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ');

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs font-medium text-red-700">
      {message}
    </p>
  );
}

const choiceValue = (c: BookingWorkoutRef) =>
  c.kind === 'NEXT_DAY'
    ? 'next'
    : c.kind === 'ROUTINE_DAY'
      ? `day:${c.routineDayId}`
      : `tpl:${c.templateId}`;

function parseChoice(value: string): BookingWorkoutRef {
  if (value.startsWith('day:')) return { kind: 'ROUTINE_DAY', routineDayId: value.slice(4) };
  if (value.startsWith('tpl:')) return { kind: 'TEMPLATE', templateId: value.slice(4) };
  return { kind: 'NEXT_DAY' };
}

/** One client's workout: their next day, one of their routine days, or a template (assigned on save). */
function ClientWorkoutSelect({
  client,
  templates,
  fallbackName,
  onChange,
}: {
  client: BookingDraftClient;
  templates: { id: string; name: string }[];
  fallbackName: string | null;
  onChange: (choice: BookingWorkoutRef) => void;
}) {
  const id = useId();
  const routine = trpc.trainer.client.routine.useQuery(
    { clientId: client.clientId, today: localDate() },
    { retry: false, staleTime: 60_000 },
  );
  const days = routine.data?.days ?? [];
  const value = choiceValue(client.workout);
  const known =
    client.workout.kind !== 'ROUTINE_DAY' ||
    days.some((d) => client.workout.kind === 'ROUTINE_DAY' && d.id === client.workout.routineDayId);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-gray-700">
        {client.name}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(parseChoice(e.target.value))}
        className={inputCls}
        data-testid="booking-workout-select"
      >
        <option value="next">{copy.nextDay}</option>
        {!known && <option value={value}>{fallbackName ?? '…'}</option>}
        {days.length > 0 && (
          <optgroup label={routine.data?.name ?? copy.workout}>
            {days.map((d) => (
              <option key={d.id} value={`day:${d.id}`}>
                {d.name}
              </option>
            ))}
          </optgroup>
        )}
        {templates.length > 0 && (
          <optgroup label={copy.template}>
            {templates.map((t) => (
              <option key={t.id} value={`tpl:${t.id}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

function EditorForm({
  target,
  onClose,
  onSaved,
}: {
  target: EditorTarget;
  onClose: () => void;
  onSaved?: (booking: TrainerBookingDto) => void;
}) {
  const ids = {
    clients: useId(),
    clientsHint: useId(),
    search: useId(),
    date: useId(),
    time: useId(),
    duration: useId(),
    until: useId(),
    location: useId(),
    note: useId(),
    noteHint: useId(),
  };
  const timeZone = useMemo(deviceTimeZone, []);
  const online = useOnline();
  const invalidate = useInvalidateBookings();
  const { gymLine } = useTrainerStatus();
  const editing = target.mode === 'edit' ? target.booking : null;
  const original = useMemo(
    () => (editing ? bookingDraftFrom(editing, timeZone) : null),
    [editing, timeZone],
  );
  const [draft, setDraft] = useState<BookingDraft>(
    () =>
      original ??
      newBookingDraft({
        date: target.mode === 'create' ? target.date : '',
        time: target.mode === 'create' ? target.time : '',
        ...(target.mode === 'create' && target.durationMin !== undefined
          ? { durationMin: target.durationMin }
          : {}),
        location: gymLine,
        ...(target.mode === 'create' && target.clients ? { clients: target.clients } : {}),
      }),
  );
  const [locationTouched, setLocationTouched] = useState(false);
  const [custom, setCustom] = useState(() => !isChipDuration(draft.durationMin));
  const [query, setQuery] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askScope, setAskScope] = useState(false);

  // The gym line can arrive after the sheet opens: pre-fill once, never over the trainer's text.
  useEffect(() => {
    if (!editing && !locationTouched && gymLine && draft.location === '') {
      setDraft((d) => ({ ...d, location: gymLine.slice(0, TRAINER_MODE_LIMITS.locationMaxChars) }));
    }
  }, [gymLine, editing, locationTouched, draft.location]);

  const set = (patch: Partial<BookingDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const isBooking = draft.kind === 'BOOKING';

  const clients = trpc.trainer.clients.list.useQuery(
    { today: localDate() },
    { retry: false, staleTime: 60_000 },
  );
  const templates = trpc.trainer.templates.list.useQuery(undefined, {
    enabled: isBooking,
    retry: false,
    staleTime: 60_000,
  });
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.date);
  // The cached week (the Schedule's own `range` call) is where overlaps are found (§12).
  const week = trpc.trainer.bookings.range.useQuery(
    bookingWeekRange(validDate ? weekStartOf(draft.date) : weekStartOf(localDate()), timeZone),
    { enabled: validDate, retry: false, staleTime: 60_000 },
  );
  const warnings = bookingOverlapWarnings(
    draft,
    week.data?.bookings ?? [],
    timeZone,
    editing?.id ?? null,
  );

  const errors = validateBookingDraft(draft);
  const visibleErrors = showErrors ? errors : {};

  const done = (booking: TrainerBookingDto) => {
    invalidate();
    onSaved?.(booking);
    onClose();
  };
  const fail = (err: unknown) => setError(userFacingErrorMessage(err));
  const create = trpc.trainer.bookings.create.useMutation({
    meta: { silent: true },
    onSuccess: (booking, input) => {
      capture('booking_created', {
        repeat: input.repeat != null,
        clients: input.clients.length,
      });
      done(booking);
    },
    onError: fail,
  });
  const update = trpc.trainer.bookings.update.useMutation({
    meta: { silent: true },
    onSuccess: done,
    onError: (err) => {
      setAskScope(false);
      invalidate();
      fail(err);
    },
  });
  const busy = create.isPending || update.isPending;

  const saveEdit = (scope: BookingScope) => {
    if (!editing || !original) return;
    update.mutate({
      bookingId: editing.id,
      expectedVersion: editing.version,
      scope,
      patch: toBookingPatch(draft, original, timeZone),
    });
  };

  const save = () => {
    setError(null);
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    if (!online) {
      setError(BOOKING_COPY.schedule.offline);
      return;
    }
    if (!editing || !original) {
      create.mutate(toCreateBookingInput(draft, timeZone));
      return;
    }
    if (Object.keys(toBookingPatch(draft, original, timeZone)).length === 0) {
      onClose();
      return;
    }
    if (editing.seriesId) setAskScope(true);
    else saveEdit('THIS');
  };

  const rows = clients.data ?? [];
  const shownClients = filterClients(rows, query);
  const picked = new Set(draft.clients.map((c) => c.clientId));
  const full = draft.clients.length >= MAX_CLIENTS;
  const toggleClient = (clientId: string, name: string, on: boolean) => {
    if (on && !picked.has(clientId) && !full) {
      set({ clients: [...draft.clients, { clientId, name, workout: { kind: 'NEXT_DAY' } }] });
    } else if (!on) {
      set({ clients: draft.clients.filter((c) => c.clientId !== clientId) });
    }
  };
  const templateOptions = (templates.data ?? []).map((t) => ({ id: t.id, name: t.name }));
  const fallbackNameOf = (clientId: string) =>
    editing?.clients.find((c) => c.clientId === clientId)?.workout.name ?? null;

  if (askScope) {
    return (
      <div className="flex flex-col gap-3 px-5 py-4">
        <h3 className="font-semibold text-gray-900">{copy.scopeTitle}</h3>
        <ScopeChoice busy={busy} onPick={saveEdit} onCancel={() => setAskScope(false)} />
      </div>
    );
  }

  return (
    <form
      id="booking-editor-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-5 px-5 py-4"
    >
      {!editing && (
        <div className="flex flex-col gap-2">
          <span id={`${ids.clients}-type`} className={labelCls}>
            {copy.type}
          </span>
          <div
            role="group"
            aria-labelledby={`${ids.clients}-type`}
            className="flex flex-wrap gap-2"
          >
            {(['BOOKING', 'BLOCK'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={draft.kind === kind}
                onClick={() => set({ kind })}
                className={chipCls(draft.kind === kind)}
              >
                {kind === 'BOOKING' ? copy.booking : copy.block}
              </button>
            ))}
          </div>
        </div>
      )}

      {isBooking && (
        <fieldset
          className="flex min-w-0 flex-col gap-2"
          aria-describedby={idList(ids.clientsHint, visibleErrors.clients && `${ids.clients}-err`)}
          aria-invalid={visibleErrors.clients ? true : undefined}
          data-testid="booking-editor-clients"
        >
          <legend className={labelCls}>{copy.clients}</legend>
          <p id={ids.clientsHint} className="text-xs text-gray-600">
            {copy.clientsMax(MAX_CLIENTS)}
          </p>
          <div className="relative">
            <label htmlFor={ids.search} className="sr-only">
              {TRAINER_MODE_COPY.clients.search}
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              id={ids.search}
              type="search"
              value={query}
              placeholder={TRAINER_MODE_COPY.clients.search}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              className={cn(inputCls, 'pl-9')}
            />
          </div>
          {clients.isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-600">{COACHING_COPY.trainer.clientsEmpty}</p>
          ) : (
            <ul className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-gray-200">
              {shownClients.map((c) => {
                const checked = picked.has(c.clientId);
                return (
                  <li key={c.clientId} className="border-b border-gray-100 last:border-b-0">
                    <label className="flex min-h-11 items-center gap-3 px-3 text-sm text-gray-900">
                      <input
                        type="checkbox"
                        className="h-5 w-5 shrink-0"
                        checked={checked}
                        disabled={!checked && full}
                        onChange={(e) => toggleClient(c.clientId, c.name, e.target.checked)}
                      />
                      <span className="min-w-0 break-words">{c.name}</span>
                    </label>
                  </li>
                );
              })}
              {shownClients.length === 0 && (
                <li className="px-3 py-3 text-sm text-gray-600">
                  {TRAINER_MODE_COPY.clients.searchEmpty(query.trim())}
                </li>
              )}
            </ul>
          )}
          <FieldError id={`${ids.clients}-err`} message={visibleErrors.clients} />
        </fieldset>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.date} className={labelCls}>
            {copy.date}
          </label>
          <input
            id={ids.date}
            type="date"
            required
            value={draft.date}
            onChange={(e) => set({ date: e.target.value })}
            aria-invalid={visibleErrors.date ? true : undefined}
            aria-describedby={visibleErrors.date ? `${ids.date}-err` : undefined}
            className={inputCls}
          />
          <FieldError id={`${ids.date}-err`} message={visibleErrors.date} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.time} className={labelCls}>
            {copy.start}
          </label>
          <input
            id={ids.time}
            type="time"
            step={300}
            required
            value={draft.time}
            onChange={(e) => set({ time: e.target.value.slice(0, 5) })}
            aria-invalid={visibleErrors.time ? true : undefined}
            aria-describedby={visibleErrors.time ? `${ids.time}-err` : undefined}
            className={inputCls}
          />
          <FieldError id={`${ids.time}-err`} message={visibleErrors.time} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span id={`${ids.duration}-label`} className={labelCls}>
          {copy.duration}
        </span>
        <div
          role="group"
          aria-labelledby={`${ids.duration}-label`}
          className="flex flex-wrap gap-2"
        >
          {BOOKING_DURATION_CHIPS.map((min) => (
            <button
              key={min}
              type="button"
              aria-pressed={!custom && draft.durationMin === min}
              onClick={() => {
                setCustom(false);
                set({ durationMin: min });
              }}
              className={chipCls(!custom && draft.durationMin === min)}
            >
              {copy.minutes(min)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={custom}
            onClick={() => setCustom(true)}
            className={chipCls(custom)}
          >
            {copy.custom}
          </button>
        </div>
        {custom && (
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={ids.duration} className="text-xs font-medium text-gray-700">
              {copy.customLabel(BOOKING_DURATION_LIMITS.min, BOOKING_DURATION_LIMITS.max)}
            </label>
            <input
              id={ids.duration}
              type="number"
              inputMode="numeric"
              min={BOOKING_DURATION_LIMITS.min}
              max={BOOKING_DURATION_LIMITS.max}
              step={5}
              value={Number.isFinite(draft.durationMin) ? draft.durationMin : ''}
              onChange={(e) => set({ durationMin: e.target.valueAsNumber })}
              aria-invalid={visibleErrors.duration ? true : undefined}
              aria-describedby={visibleErrors.duration ? `${ids.duration}-err` : undefined}
              className={cn(inputCls, 'max-w-40')}
            />
            <FieldError id={`${ids.duration}-err`} message={visibleErrors.duration} />
          </div>
        )}
      </div>

      {!editing && (
        <fieldset className="flex flex-col gap-2">
          <legend className={labelCls}>{copy.repeat}</legend>
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            {(['NONE', 'WEEKLY'] as const).map((repeat) => (
              <label
                key={repeat}
                className="flex min-h-11 items-center gap-2 text-sm text-gray-800"
              >
                <input
                  type="radio"
                  name="booking-repeat"
                  className="h-5 w-5"
                  checked={draft.repeat === repeat}
                  onChange={() => set({ repeat })}
                />
                {repeat === 'NONE' ? copy.noRepeat : copy.weekly}
              </label>
            ))}
          </div>
          {draft.repeat === 'WEEKLY' && (
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={ids.until} className="text-xs font-medium text-gray-700">
                {copy.until}
              </label>
              <input
                id={ids.until}
                type="date"
                value={draft.until ?? ''}
                min={validDate ? draft.date : undefined}
                max={validDate ? maxRepeatUntil(draft.date) : undefined}
                onChange={(e) => set({ until: e.target.value === '' ? null : e.target.value })}
                aria-invalid={visibleErrors.until ? true : undefined}
                aria-describedby={idList(
                  `${ids.until}-hint`,
                  visibleErrors.until && `${ids.until}-err`,
                )}
                className={cn(inputCls, 'sm:max-w-56')}
              />
              <p id={`${ids.until}-hint`} className="text-xs text-gray-600">
                {copy.weeksDefault(TRAINER_MODE_LIMITS.defaultWeeklyRepeats)}
              </p>
              <FieldError id={`${ids.until}-err`} message={visibleErrors.until} />
            </div>
          )}
        </fieldset>
      )}

      {isBooking && draft.clients.length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-2" data-testid="booking-editor-workouts">
          <legend className={labelCls}>{copy.workout}</legend>
          {draft.clients.map((c) => (
            <ClientWorkoutSelect
              key={c.clientId}
              client={c}
              templates={templateOptions}
              fallbackName={fallbackNameOf(c.clientId)}
              onChange={(workout) =>
                set({
                  clients: draft.clients.map((x) =>
                    x.clientId === c.clientId ? { ...x, workout } : x,
                  ),
                })
              }
            />
          ))}
        </fieldset>
      )}

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={ids.location} className={labelCls}>
          {copy.location}
        </label>
        <input
          id={ids.location}
          type="text"
          value={draft.location}
          maxLength={TRAINER_MODE_LIMITS.locationMaxChars}
          autoComplete="off"
          onChange={(e) => {
            setLocationTouched(true);
            set({ location: e.target.value });
          }}
          aria-invalid={visibleErrors.location ? true : undefined}
          aria-describedby={visibleErrors.location ? `${ids.location}-err` : undefined}
          className={inputCls}
        />
        <FieldError id={`${ids.location}-err`} message={visibleErrors.location} />
      </div>

      {isBooking && (
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={ids.note} className={labelCls}>
            {copy.note}
          </label>
          <textarea
            id={ids.note}
            rows={2}
            value={draft.note}
            maxLength={TRAINER_MODE_LIMITS.noteMaxChars}
            onChange={(e) => set({ note: e.target.value })}
            aria-invalid={visibleErrors.note ? true : undefined}
            aria-describedby={idList(ids.noteHint, visibleErrors.note && `${ids.note}-err`)}
            className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
          />
          <p id={ids.noteHint} className="text-xs text-gray-600">
            {copy.noteHint}
          </p>
          <FieldError id={`${ids.note}-err`} message={visibleErrors.note} />
        </div>
      )}

      {warnings.length > 0 && (
        <ul
          role="status"
          className="flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
          data-testid="booking-overlap-warning"
        >
          {warnings.map((w, i) => (
            <li key={`${w}-${i}`}>{w}</li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="submit" className="min-h-11 sm:flex-1" loading={busy}>
          {copy.save}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:flex-1"
          onClick={onClose}
          disabled={busy}
        >
          {COACHING_COPY.common.cancel}
        </Button>
      </div>
    </form>
  );
}

/** The booking editor sheet; `target` null = closed. */
export function BookingEditor({
  target,
  onClose,
  onSaved,
}: {
  target: EditorTarget | null;
  onClose: () => void;
  onSaved?: (booking: TrainerBookingDto) => void;
}) {
  // Keep the last target while the sheet animates out (MO-02 exit).
  const [shown, setShown] = useState<{ target: EditorTarget; key: number } | null>(null);
  useEffect(() => {
    if (target) setShown((prev) => ({ target, key: (prev?.key ?? 0) + 1 }));
  }, [target]);
  const current = target ?? shown?.target ?? null;
  const title = current?.mode === 'edit' ? copy.editTitle : copy.newTitle;
  return (
    <Sheet open={target !== null} onClose={onClose} title={title} size="lg">
      {current && shown && (
        <EditorForm
          key={shown.key}
          target={current}
          onClose={onClose}
          {...(onSaved ? { onSaved } : {})}
        />
      )}
    </Sheet>
  );
}
