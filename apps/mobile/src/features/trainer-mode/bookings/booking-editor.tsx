import { useRef, useState } from 'react';
import { Keyboard, View, type TextInput } from 'react-native';
import {
  TRAINER_MODE_LIMITS,
  type BookingScope,
  type BookingWorkoutRef,
  type ClientRowDto,
  type TrainerBookingDto,
} from '@chefer/types';
import {
  Button,
  Chip,
  Input,
  PressableScale,
  SearchField,
  SegmentedControl,
  Sheet,
  Text,
  useThemeColors,
} from '@chefer/ui-mobile';
import {
  addDaysLocal,
  bookingDraftFrom,
  bookingWeekRange,
  defaultRepeatUntil,
  deviceTimeZone,
  filterClients,
  hasBookingChanges,
  isDraftFull,
  maxRepeatUntil,
  newBookingDraft,
  newBookingSlot,
  setDraftClientWorkout,
  toCreateBookingInput,
  todayIn,
  toggleDraftClient,
  toUpdateBookingInput,
  userFacingErrorMessage,
  weekStartOf,
  type BookingDraft,
} from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { track } from '../../../lib/analytics';
import { useT } from '../../../lib/i18n';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { useIsOnline } from '../../gym/workout/use-is-online';
import { askBookingReminderPermissionOnce } from '../../notifications/booking-reminders';
import { firstNameOf } from '../../trainer/format';
import { CheckRow } from '../templates/check-row';
import { bookingDraftErrorTexts, bookingOverlapTexts } from './booking-model';
import { DateStepperField, DurationField, StartTimeField } from './editor-fields';
import { useInvalidateBookings } from './use-bookings';

// ─── The booking editor (docs/prd-2026-10/trainer-mode.md §6.3) ───────────────
// A Sheet: Type (Booking / Blocked time), Clients (active ones, searchable
// from 8, at most 6; hidden for blocked time), Date, Start (5-minute steps),
// Duration (chips or custom 15–240), Repeat (new only: Doesn't repeat / Every
// week for 12 weeks or until a date), Workout per client (their next routine
// day, one of their days, or a template — assigned on save), Location
// (pre-filled with the trainer's gym line) and a Note the clients see. It
// warns when the slot overlaps something already on the calendar (cached
// week), and still saves. Editing a repeating booking asks "This booking /
// This and following" first. Needs a connection (§12). Mobile moves bookings
// here, never by drag.

/** What a new booking opens with: the day (and a long-pressed time), a client, the gym line. */
export type DraftPrefill = {
  date: string;
  /** Omitted: the next full hour today, 18:00 on other days (`newBookingSlot`). */
  time?: string;
  client?: { clientId: string; name: string };
  location?: string | null;
};

function draftFor(prefill: DraftPrefill, zone: string): BookingDraft {
  const slot = prefill.time
    ? { date: prefill.date, time: prefill.time }
    : newBookingSlot(prefill.date, new Date(), zone);
  return newBookingDraft({
    ...slot,
    location: prefill.location ?? null,
    clients: prefill.client ? [prefill.client] : [],
  });
}

export type BookingEditorTarget =
  | { kind: 'new'; prefill: DraftPrefill }
  | { kind: 'edit'; booking: TrainerBookingDto };

type WorkoutChoice = { value: string; label: string; ref: BookingWorkoutRef; group?: string };

function workoutKey(ref: BookingWorkoutRef | undefined): string {
  if (!ref || ref.kind === 'NEXT_DAY') return 'next';
  return ref.kind === 'ROUTINE_DAY' ? `day:${ref.routineDayId}` : `tpl:${ref.templateId}`;
}

function ClientWorkoutPicker({
  client,
  value,
  onChange,
  routineDays,
  templates,
  testID,
}: {
  client: { clientId: string; name: string };
  value: BookingWorkoutRef | undefined;
  onChange: (ref: BookingWorkoutRef) => void;
  routineDays: { id: string; name: string }[];
  templates: { id: string; name: string }[];
  testID: string;
}) {
  const colors = useThemeColors();
  const tr = useT();
  const [open, setOpen] = useState(false);
  const choices: WorkoutChoice[] = [
    { value: 'next', label: tr.t('trainer.bookings.editor.nextDay'), ref: { kind: 'NEXT_DAY' } },
    ...routineDays.map((d) => ({
      value: `day:${d.id}`,
      label: d.name,
      ref: { kind: 'ROUTINE_DAY' as const, routineDayId: d.id },
    })),
    ...templates.map((t) => ({
      value: `tpl:${t.id}`,
      label: t.name,
      group: tr.t('trainer.bookings.editor.template'),
      ref: { kind: 'TEMPLATE' as const, templateId: t.id },
    })),
  ];
  const current = choices.find((c) => c.value === workoutKey(value)) ?? choices[0];
  const label = current?.group
    ? tr.t('trainer.bookings.editor.workoutGroup', { group: current.group, name: current.label })
    : current?.label;
  return (
    <View className="gap-1">
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={tr.t('trainer.bookings.editor.workoutFor', {
          name: client.name,
          choice: label ?? '',
        })}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        className="min-h-12 flex-row items-center gap-2 rounded-control bg-surface-sunken px-4 py-2"
      >
        <View className="min-w-0 flex-1">
          <Text className="text-subhead font-semibold text-label" numberOfLines={1}>
            {firstNameOf(client.name)}
          </Text>
          <Text className="text-subhead text-label-secondary" numberOfLines={2}>
            {label}
          </Text>
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} color={colors.labelTertiary} size={18} />
      </PressableScale>
      {open ? (
        <View className="gap-1 pl-2">
          {choices.map((choice) => (
            <CheckRow
              key={choice.value}
              testID={`${testID}-${choice.value}`}
              title={choice.label}
              detail={choice.group ?? null}
              checked={choice.value === current?.value}
              onToggle={() => {
                onChange(choice.ref);
                setOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function BookingEditorSheet({
  visible,
  target,
  onClose,
  onSaved,
}: {
  visible: boolean;
  target: BookingEditorTarget;
  onClose: () => void;
  onSaved?: (booking: TrainerBookingDto) => void;
}) {
  const tr = useT();
  const online = useIsOnline();
  const invalidate = useInvalidateBookings();
  const [zone] = useState(deviceTimeZone);
  const [today] = useState(() => todayIn(zone));
  const [listToday] = useState(localDate);
  const editing = target.kind === 'edit' ? target.booking : null;
  const [initial] = useState<BookingDraft>(() =>
    target.kind === 'edit'
      ? bookingDraftFrom(target.booking, zone)
      : draftFor(target.prefill, zone),
  );
  const [draft, setDraft] = useState<BookingDraft>(initial);
  const [query, setQuery] = useState('');
  const [askScope, setAskScope] = useState(false);
  const [tried, setTried] = useState(false);
  const noteRef = useRef<TextInput>(null);
  const update = (patch: Partial<BookingDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const clients = trpc.trainer.clients.list.useQuery({ today: listToday }, { enabled: visible });
  const templates = trpc.trainer.templates.list.useQuery(undefined, {
    enabled: visible && draft.kind === 'BOOKING',
    retry: false,
  });
  const booking = draft.kind === 'BOOKING';
  const routines = trpc.useQueries((t) =>
    (booking ? draft.clients : []).map(({ clientId }) =>
      t.trainer.client.routine({ clientId, today: listToday }, { enabled: visible, retry: false }),
    ),
  );
  // The overlap warning reads the cached week (the schedule already asked for it).
  const week = trpc.trainer.bookings.range.useQuery(
    bookingWeekRange(weekStartOf(draft.date), zone),
    {
      enabled: visible,
      retry: false,
      staleTime: 30_000,
    },
  );

  const create = trpc.trainer.bookings.create.useMutation({ meta: { silent: true } });
  const save = trpc.trainer.bookings.update.useMutation({ meta: { silent: true } });
  const busy = create.isPending || save.isPending;
  const error = create.error ?? save.error;

  const rows: ClientRowDto[] = clients.data ?? [];
  const searchable = rows.length >= TRAINER_MODE_LIMITS.clientSearchFrom;
  const shownRows = searchable ? filterClients(rows, query) : rows;
  // A client of this booking who is no longer on the list still shows (by the booking's name).
  const nameOf = (clientId: string) =>
    rows.find((r) => r.clientId === clientId)?.name ??
    editing?.clients.find((c) => c.clientId === clientId)?.name ??
    '';

  const errors = bookingDraftErrorTexts(tr, draft);
  const problem = errors.clients ?? null;
  const invalid = Object.keys(errors).length > 0;
  const warnings = bookingOverlapTexts(
    tr,
    draft,
    week.data?.bookings ?? [],
    zone,
    editing?.id ?? null,
  );

  const finish = (saved: TrainerBookingDto) => {
    void invalidate();
    onSaved?.(saved);
    onClose();
  };

  const submit = (scope: BookingScope) => {
    setTried(true);
    if (invalid || busy) return;
    if (!online) return;
    Keyboard.dismiss();
    if (!editing) {
      const input = toCreateBookingInput(draft, zone);
      create.mutate(input, {
        onSuccess: (saved) => {
          if (draft.kind === 'BOOKING') {
            track('booking_created', {
              repeat: draft.repeat === 'WEEKLY',
              clients: draft.clients.length,
            });
          }
          // §7.3: the first booking made is the moment reminders have value.
          void askBookingReminderPermissionOnce('trainer');
          finish(saved);
        },
      });
      return;
    }
    const payload = toUpdateBookingInput(editing, initial, draft, scope, zone);
    if (!hasBookingChanges(payload)) {
      onClose();
      return;
    }
    save.mutate(payload, {
      onSuccess: (saved) => finish(saved),
      onError: () => void invalidate(),
    });
  };

  const onSave = () => {
    if (editing?.seriesId && !askScope) {
      setTried(true);
      if (invalid || !online) return;
      setAskScope(true);
      return;
    }
    submit('THIS');
  };

  const footer = askScope ? (
    <View className="gap-2">
      <Button testID="booking-editor-scope-this" loading={busy} onPress={() => submit('THIS')}>
        {tr.t('trainer.bookings.editor.thisOnly')}
      </Button>
      <Button
        testID="booking-editor-scope-following"
        variant="outline"
        disabled={busy}
        onPress={() => submit('FOLLOWING')}
      >
        {tr.t('trainer.bookings.editor.following')}
      </Button>
    </View>
  ) : (
    <Button testID="booking-editor-save" loading={busy} disabled={!online} onPress={onSave}>
      {tr.t('trainer.bookings.editor.save')}
    </Button>
  );

  const until = draft.until ?? defaultRepeatUntil(draft.date);

  return (
    <Sheet
      testID="booking-editor"
      visible={visible}
      onClose={onClose}
      title={
        askScope
          ? tr.t('trainer.bookings.editor.scopeTitle')
          : editing
            ? tr.t('trainer.bookings.editor.editTitle')
            : tr.t('trainer.bookings.editor.newTitle')
      }
      footer={footer}
      maxHeight="92%"
    >
      {askScope ? (
        <Text className="text-subhead text-label-secondary">
          {tr.t('trainer.bookings.editor.scopeTitle')}
        </Text>
      ) : (
        <View className="gap-5 pb-2">
          {!online ? (
            <Text
              testID="booking-editor-offline"
              accessibilityLiveRegion="polite"
              className="text-subhead text-attention"
            >
              {tr.t('trainer.bookings.schedule.offline')}
            </Text>
          ) : null}

          {editing ? null : (
            <View className="gap-2">
              <Text className="text-subhead font-semibold text-label-secondary">
                {tr.t('trainer.bookings.editor.type')}
              </Text>
              <SegmentedControl<'BOOKING' | 'BLOCK'>
                testID="booking-editor-type"
                accessibilityLabel={tr.t('trainer.bookings.editor.type')}
                value={draft.kind}
                onChange={(kind) => update({ kind })}
                options={[
                  {
                    value: 'BOOKING',
                    label: tr.t('trainer.bookings.editor.booking'),
                    testID: 'booking-editor-type-booking',
                  },
                  {
                    value: 'BLOCK',
                    label: tr.t('trainer.bookings.editor.block'),
                    testID: 'booking-editor-type-block',
                  },
                ]}
              />
            </View>
          )}

          {booking ? (
            <View testID="booking-editor-clients" className="gap-2">
              <View className="flex-row items-baseline justify-between gap-2">
                <Text className="text-subhead font-semibold text-label-secondary">
                  {tr.t('trainer.bookings.editor.clients')}
                </Text>
                <Text className="text-caption text-label-tertiary">
                  {tr.t('trainer.bookings.editor.clientsMax', {
                    count: TRAINER_MODE_LIMITS.clientsPerBooking,
                  })}
                </Text>
              </View>
              {searchable ? (
                <SearchField
                  testID="booking-editor-search"
                  accessibilityLabel={tr.t('trainer.bookings.editor.clients')}
                  placeholder={tr.t('trainer.clients.search')}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              ) : null}
              {shownRows.map((row) => {
                const checked = draft.clients.some((c) => c.clientId === row.clientId);
                return (
                  <CheckRow
                    key={row.clientId}
                    testID={`booking-editor-client-${row.clientId}`}
                    title={row.name}
                    checked={checked}
                    disabled={!checked && isDraftFull(draft)}
                    onToggle={() =>
                      setDraft((d) =>
                        toggleDraftClient(d, { clientId: row.clientId, name: row.name }),
                      )
                    }
                  />
                );
              })}
              {tried && problem ? (
                <Text
                  testID="booking-editor-needs-client"
                  accessibilityLiveRegion="polite"
                  className="text-subhead text-danger"
                >
                  {problem}
                </Text>
              ) : null}
            </View>
          ) : null}

          <DateStepperField
            testID="booking-editor-date"
            label={tr.t('trainer.bookings.editor.date')}
            value={draft.date}
            min={editing && initial.date < today ? initial.date : today}
            max={addDaysLocal(today, TRAINER_MODE_LIMITS.bookingHorizonDays)}
            onChange={(date) => update({ date, until: null })}
          />
          <StartTimeField
            testID="booking-editor-start"
            value={draft.time}
            onChange={(time) => update({ time })}
          />
          <DurationField
            testID="booking-editor-duration"
            value={draft.durationMin}
            onChange={(durationMin) => update({ durationMin })}
          />

          {warnings.length > 0 ? (
            <View
              testID="booking-editor-overlap"
              accessibilityLiveRegion="polite"
              className="gap-1 rounded-control bg-attention/10 px-3 py-2"
            >
              {warnings.map((line) => (
                <Text key={line} className="min-w-0 text-subhead text-label">
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {editing ? null : (
            <View className="gap-2">
              <Text className="text-subhead font-semibold text-label-secondary">
                {tr.t('trainer.bookings.editor.repeat')}
              </Text>
              <SegmentedControl<'NONE' | 'WEEKLY'>
                testID="booking-editor-repeat"
                accessibilityLabel={tr.t('trainer.bookings.editor.repeat')}
                value={draft.repeat}
                onChange={(repeat) => update({ repeat, until: null })}
                options={[
                  {
                    value: 'NONE',
                    label: tr.t('trainer.bookings.editor.noRepeat'),
                    testID: 'booking-editor-repeat-none',
                  },
                  {
                    value: 'WEEKLY',
                    label: tr.t('trainer.bookings.editor.weekly'),
                    testID: 'booking-editor-repeat-weekly',
                  },
                ]}
              />
              {draft.repeat === 'WEEKLY' ? (
                <View className="gap-2">
                  <View className="flex-row flex-wrap gap-2">
                    <Chip
                      testID="booking-editor-repeat-default"
                      label={tr.t('trainer.bookings.editor.weeksDefault', {
                        count: TRAINER_MODE_LIMITS.defaultWeeklyRepeats,
                      })}
                      selected={draft.until === null}
                      onPress={() => update({ until: null })}
                    />
                    <Chip
                      testID="booking-editor-repeat-until"
                      label={tr.t('trainer.bookings.editor.until')}
                      selected={draft.until !== null}
                      onPress={() => update({ until })}
                    />
                  </View>
                  {draft.until !== null ? (
                    <DateStepperField
                      testID="booking-editor-until"
                      label={tr.t('trainer.bookings.editor.until')}
                      value={draft.until}
                      min={addDaysLocal(draft.date, 7)}
                      max={maxRepeatUntil(draft.date)}
                      step={7}
                      onChange={(next) => update({ until: next })}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          )}

          {booking && draft.clients.length > 0 ? (
            <View testID="booking-editor-workouts" className="gap-2">
              <Text className="text-subhead font-semibold text-label-secondary">
                {tr.t('trainer.bookings.editor.workout')}
              </Text>
              {draft.clients.map(({ clientId, workout }, i) => {
                const routine = routines[i]?.data;
                return (
                  <ClientWorkoutPicker
                    key={clientId}
                    testID={`booking-editor-workout-${clientId}`}
                    client={{ clientId, name: nameOf(clientId) }}
                    value={workout}
                    routineDays={
                      routine
                        ? routine.days
                            .slice()
                            .sort((a, b) => a.position - b.position)
                            .map((d) => ({ id: d.id, name: d.name }))
                        : []
                    }
                    templates={(templates.data ?? []).map((t) => ({ id: t.id, name: t.name }))}
                    onChange={(ref) => setDraft((d) => setDraftClientWorkout(d, clientId, ref))}
                  />
                );
              })}
            </View>
          ) : null}

          <Input
            testID="booking-editor-location"
            label={tr.t('trainer.bookings.editor.location')}
            maxLength={TRAINER_MODE_LIMITS.locationMaxChars}
            value={draft.location}
            onChangeText={(location) => update({ location })}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => noteRef.current?.focus()}
          />
          <View className="gap-1">
            <Input
              ref={noteRef}
              testID="booking-editor-note"
              label={tr.t('trainer.bookings.editor.note')}
              maxLength={TRAINER_MODE_LIMITS.noteMaxChars}
              multiline
              value={draft.note}
              onChangeText={(note) => update({ note })}
              className="min-h-20"
            />
            <Text className="text-caption text-label-secondary">
              {tr.t('trainer.bookings.editor.noteHint')}
            </Text>
          </View>

          {error ? (
            <Text
              testID="booking-editor-error"
              accessibilityLiveRegion="polite"
              className="text-subhead text-danger"
            >
              {userFacingErrorMessage(error)}
            </Text>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

/** One editor per screen: `open(target)` shows a fresh sheet; `sheet` goes once in the tree. */
export function useBookingEditor(onSaved?: (booking: TrainerBookingDto) => void) {
  const [state, setState] = useState<{ target: BookingEditorTarget; key: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const open = (target: BookingEditorTarget) => {
    setState((s) => ({ target, key: (s?.key ?? 0) + 1 }));
    setVisible(true);
  };
  const sheet = state ? (
    <BookingEditorSheet
      key={state.key}
      visible={visible}
      target={state.target}
      onClose={() => setVisible(false)}
      onSaved={onSaved}
    />
  ) : null;
  return { open, sheet };
}
