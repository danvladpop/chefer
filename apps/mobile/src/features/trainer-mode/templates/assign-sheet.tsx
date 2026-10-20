import { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, View } from 'react-native';
import {
  TEMPLATE_COPY,
  TRAINER_MODE_COPY,
  TRAINER_MODE_LIMITS,
  type AssignTarget,
  type ClientRowDto,
  type WorkoutTemplateTargetsResultDto,
} from '@chefer/types';
import { Button, Chip, ErrorState, SearchField, Sheet, Text, useSnackbar } from '@chefer/ui-mobile';
import {
  assignClientRoutine,
  assignTargetFor,
  canAssignAddDay,
  canAssignReplaceDay,
  defaultAssignChoice,
  filterClients,
  userFacingErrorMessage,
  type AssignChoice,
  type AssignClientRoutine,
} from '@chefer/utils';
import { track } from '../../../lib/analytics';
import { trpc } from '../../../lib/trpc';
import { localDate } from '../../gym/offline/ids';
import { WEEKDAY_SHORT_LABELS } from '../../gym/routine/weekday';
import { CheckRow } from './check-row';
import { TuneStep } from './tune-step';

// ─── Assign a template (trainer-mode.md §6.6, M2) ─────────────────────────────
// One sheet, in steps: (pick a template — from client detail only) → pick clients (search from 8) →
// for each client "Add as a new day" (with an optional weekday) or "Replace a day" (one of their
// routine days) → confirm. Each client is assigned on its own: the result lists who got it, and why
// the others did not. Then "Set weights for each client" steps through the clients who got it.

const COPY = TEMPLATE_COPY.assign;

type Step =
  | { kind: 'template' }
  | { kind: 'clients' }
  | { kind: 'mode' }
  | { kind: 'result'; result: WorkoutTemplateTargetsResultDto }
  | { kind: 'tune'; index: number; done: { clientId: string; routineDayId: string }[] };

export type AssignTemplateSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The template to assign; omit to start by picking one (client detail). */
  template?: { id: string; name: string } | null;
  /** Client detail: this client starts ticked. */
  preselectedClientId?: string;
  testID?: string;
};

export function AssignTemplateSheet({
  visible,
  onClose,
  template = null,
  preselectedClientId,
  testID = 'assign-sheet',
}: AssignTemplateSheetProps) {
  const utils = trpc.useUtils();
  const snackbar = useSnackbar();
  const [today] = useState(localDate);
  const firstStep: Step = template ? { kind: 'clients' } : { kind: 'template' };
  const [step, setStep] = useState<Step>(firstStep);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(template);
  const [selected, setSelected] = useState<string[]>(
    preselectedClientId ? [preselectedClientId] : [],
  );
  const [choices, setChoices] = useState<Record<string, AssignChoice>>({});
  const [query, setQuery] = useState('');

  // A fresh start every time the sheet opens.
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) {
      setStep(firstStep);
      setPicked(template);
      setSelected(preselectedClientId ? [preselectedClientId] : []);
      setChoices({});
      setQuery('');
    }
  }

  const clients = trpc.trainer.clients.list.useQuery({ today }, { enabled: visible });
  const templates = trpc.trainer.templates.list.useQuery(
    {},
    { enabled: visible && template === null },
  );
  const needsRoutines = visible && step.kind === 'mode';
  const routines = trpc.useQueries((t) =>
    selected.map((clientId) =>
      t.trainer.client.routine({ clientId, today }, { enabled: needsRoutines, staleTime: 0 }),
    ),
  );
  const assign = trpc.trainer.templates.assign.useMutation({ meta: { silent: true } });

  const rows = clients.data ?? [];
  const nameOf = (clientId: string) => rows.find((r) => r.clientId === clientId)?.name ?? 'Client';
  const stateOf = (clientId: string): AssignClientRoutine => {
    const query = routines[selected.indexOf(clientId)];
    return query
      ? assignClientRoutine({
          isLoading: query.isPending,
          isError: query.isError,
          data: query.data,
        })
      : { state: 'loading' };
  };
  const choiceOf = (clientId: string): AssignChoice =>
    choices[clientId] ?? defaultAssignChoice(stateOf(clientId));
  const setChoice = (clientId: string, patch: Partial<AssignChoice>) =>
    setChoices((prev) => ({ ...prev, [clientId]: { ...choiceOf(clientId), ...patch } }));

  const targets = selected
    .map((clientId) => assignTargetFor(clientId, choiceOf(clientId), stateOf(clientId)))
    .filter((t): t is AssignTarget => t !== null);

  const confirm = () => {
    if (!picked || targets.length === 0) return;
    assign.mutate(
      { templateId: picked.id, targets },
      {
        onSuccess: (result) => {
          const ok = result.results.filter((r) => r.ok).length;
          if (ok > 0) {
            track('template_assigned', { clients: ok });
            snackbar.show({ message: COPY.done(ok), tone: 'success' });
          }
          void utils.trainer.templates.list.invalidate();
          void utils.trainer.templates.get.invalidate({ templateId: picked.id });
          void utils.trainer.client.routine.invalidate();
          setStep({ kind: 'result', result });
        },
        onError: (error) => Alert.alert('Could not assign', userFacingErrorMessage(error)),
      },
    );
  };

  const title =
    step.kind === 'tune'
      ? TEMPLATE_COPY.tune.title
      : picked
        ? COPY.title(picked.name)
        : COPY.fromClient;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step.kind === 'template') {
    const list = templates.data ?? [];
    body = templates.isPending ? (
      <ActivityIndicator testID={`${testID}-templates-loading`} />
    ) : templates.isError ? (
      <ErrorState testID={`${testID}-templates-error`} onRetry={() => void templates.refetch()} />
    ) : list.length === 0 ? (
      <Text testID={`${testID}-no-templates`} className="text-subhead text-label-secondary">
        {TEMPLATE_COPY.library.emptyTitle}
      </Text>
    ) : (
      <View className="gap-2">
        <Text className="text-subhead font-semibold text-label-secondary">{COPY.pickTemplate}</Text>
        {list.map((t) => (
          <CheckRow
            key={t.id}
            testID={`${testID}-template-${t.id}`}
            title={t.name}
            detail={TEMPLATE_COPY.library.exercises(t.exerciseCount)}
            checked={picked?.id === t.id}
            onToggle={() => setPicked({ id: t.id, name: t.name })}
          />
        ))}
      </View>
    );
    footer = (
      <Button
        testID={`${testID}-next`}
        disabled={picked === null}
        onPress={() => setStep({ kind: 'clients' })}
      >
        {COPY.next}
      </Button>
    );
  } else if (step.kind === 'clients') {
    const searchable = rows.length >= TRAINER_MODE_LIMITS.clientSearchFrom;
    const shown: ClientRowDto[] = searchable ? filterClients(rows, query) : rows;
    const toggle = (clientId: string) =>
      setSelected((prev) =>
        prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
      );
    body = clients.isPending ? (
      <ActivityIndicator testID={`${testID}-clients-loading`} />
    ) : clients.isError ? (
      <ErrorState testID={`${testID}-clients-error`} onRetry={() => void clients.refetch()} />
    ) : rows.length === 0 ? (
      <Text testID={`${testID}-no-clients`} className="text-subhead text-label-secondary">
        {COPY.noClients}
      </Text>
    ) : (
      <View className="gap-2">
        <Text className="text-subhead font-semibold text-label-secondary">{COPY.pickClients}</Text>
        {searchable ? (
          <SearchField
            testID={`${testID}-search`}
            accessibilityLabel={TEMPLATE_COPY.assign.pickClients}
            placeholder={TRAINER_MODE_COPY.clients.search}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        ) : null}
        {shown.map((row) => (
          <CheckRow
            key={row.clientId}
            testID={`${testID}-client-${row.clientId}`}
            title={row.name}
            checked={selected.includes(row.clientId)}
            onToggle={() => toggle(row.clientId)}
          />
        ))}
      </View>
    );
    footer = (
      <View className="flex-row gap-2">
        {template ? null : (
          <Button
            testID={`${testID}-back`}
            variant="outline"
            className="flex-1"
            onPress={() => setStep({ kind: 'template' })}
          >
            {COPY.back}
          </Button>
        )}
        <Button
          testID={`${testID}-next`}
          className="flex-1"
          disabled={selected.length === 0}
          onPress={() => setStep({ kind: 'mode' })}
        >
          {COPY.next}
        </Button>
      </View>
    );
  } else if (step.kind === 'mode') {
    body = (
      <View className="gap-3">
        {selected.map((clientId) => (
          <ClientChoice
            key={clientId}
            testID={`${testID}-choice-${clientId}`}
            name={nameOf(clientId)}
            routine={stateOf(clientId)}
            choice={choiceOf(clientId)}
            onChange={(patch) => setChoice(clientId, patch)}
          />
        ))}
      </View>
    );
    footer = (
      <View className="flex-row gap-2">
        <Button
          testID={`${testID}-back`}
          variant="outline"
          className="flex-1"
          onPress={() => setStep({ kind: 'clients' })}
        >
          {COPY.back}
        </Button>
        <Button
          testID={`${testID}-confirm`}
          className="flex-1"
          disabled={targets.length === 0}
          loading={assign.isPending}
          onPress={confirm}
        >
          {COPY.confirm(targets.length)}
        </Button>
      </View>
    );
  } else if (step.kind === 'result') {
    const done = step.result.results.flatMap((r) =>
      r.ok ? [{ clientId: r.clientId, routineDayId: r.routineDayId }] : [],
    );
    // Every client that did not get it, with why (the same lines as on the web).
    const failed = step.result.results.flatMap((r) => (r.ok ? [] : [r]));
    body = (
      <View className="gap-2">
        {done.length > 0 ? (
          <Text testID={`${testID}-done`} className="text-headline font-semibold text-label">
            {COPY.done(done.length)}
          </Text>
        ) : null}
        {failed.length > 0 ? (
          <Text testID={`${testID}-failed`} className="text-subhead text-label-secondary">
            {COPY.failed(failed.length)}
          </Text>
        ) : null}
        {failed.map((r) => (
          <Text
            key={r.clientId}
            testID={`${testID}-failure-${r.clientId}`}
            className="text-subhead text-label-secondary"
          >
            {`${nameOf(r.clientId)}: ${COPY.failureReason[r.reason]}`}
          </Text>
        ))}
      </View>
    );
    footer = (
      <View className="gap-2">
        {done.length > 0 ? (
          <Button
            testID={`${testID}-tune`}
            onPress={() => setStep({ kind: 'tune', index: 0, done })}
          >
            {COPY.tune}
          </Button>
        ) : null}
        <Button testID={`${testID}-close-done`} variant="outline" onPress={onClose}>
          {TEMPLATE_COPY.tune.done}
        </Button>
      </View>
    );
  } else if (picked) {
    const current = step.done[step.index];
    const last = step.index >= step.done.length - 1;
    const advance = () => (last ? onClose() : setStep({ ...step, index: step.index + 1 }));
    if (current) {
      return (
        <Sheet
          visible={visible}
          onClose={onClose}
          title={title}
          eyebrow={TEMPLATE_COPY.tune.step(step.index + 1, step.done.length)}
          testID={testID}
        >
          <TuneStep
            key={current.clientId}
            testID={`${testID}-tune-step`}
            clientId={current.clientId}
            clientName={nameOf(current.clientId)}
            routineDayId={current.routineDayId}
            templateId={picked.id}
            today={today}
            last={last}
            onDone={advance}
          />
        </Sheet>
      );
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID} footer={footer}>
      {body}
    </Sheet>
  );
}

function ClientChoice({
  testID,
  name,
  routine,
  choice,
  onChange,
}: {
  testID: string;
  name: string;
  routine: AssignClientRoutine;
  choice: AssignChoice;
  onChange: (patch: Partial<AssignChoice>) => void;
}) {
  const header = (
    <Text className="text-headline font-semibold text-label" numberOfLines={2}>
      {name}
    </Text>
  );
  if (routine.state === 'loading') {
    return (
      <View testID={testID} className="gap-2 rounded-card border border-separator bg-surface p-4">
        {header}
        <ActivityIndicator testID={`${testID}-loading`} />
      </View>
    );
  }
  if (routine.state === 'none' || routine.state === 'error') {
    const none = routine.state === 'none';
    return (
      <View testID={testID} className="gap-1 rounded-card border border-separator bg-surface p-4">
        {header}
        <Text
          testID={`${testID}-${none ? 'no-routine' : 'error'}`}
          className="text-subhead text-label-secondary"
        >
          {none ? COPY.noRoutine : COPY.routineError}
        </Text>
      </View>
    );
  }
  const addOk = canAssignAddDay(routine);
  const replaceOk = canAssignReplaceDay(routine);
  return (
    <View testID={testID} className="gap-3 rounded-card border border-separator bg-surface p-4">
      {header}
      <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
        <Chip
          testID={`${testID}-add`}
          label={COPY.addDay}
          selected={choice.mode === 'ADD_DAY'}
          disabled={!addOk}
          onPress={() => onChange({ mode: 'ADD_DAY' })}
        />
        <Chip
          testID={`${testID}-replace`}
          label={COPY.replaceDay}
          selected={choice.mode === 'REPLACE_DAY'}
          disabled={!replaceOk}
          onPress={() => onChange({ mode: 'REPLACE_DAY' })}
        />
      </View>
      {!addOk ? (
        <Text testID={`${testID}-day-limit`} className="text-caption text-label-secondary">
          {COPY.dayLimit}
        </Text>
      ) : null}
      {choice.mode === 'ADD_DAY' && addOk ? (
        <View className="gap-1.5">
          <Text className="text-subhead text-label-secondary">{COPY.weekday}</Text>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
            {WEEKDAY_SHORT_LABELS.map((label, i) => (
              <Chip
                key={label}
                testID={`${testID}-weekday-${i}`}
                label={label}
                selected={choice.weekday === i}
                onPress={() => onChange({ weekday: choice.weekday === i ? null : i })}
              />
            ))}
          </View>
        </View>
      ) : null}
      {choice.mode === 'REPLACE_DAY' ? (
        <View className="gap-1.5">
          <Text className="text-subhead text-label-secondary">{COPY.pickDay}</Text>
          <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
            {routine.days.map((day) => (
              <Chip
                key={day.id}
                testID={`${testID}-day-${day.id}`}
                label={day.name}
                selected={choice.routineDayId === day.id}
                onPress={() => onChange({ routineDayId: day.id })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
