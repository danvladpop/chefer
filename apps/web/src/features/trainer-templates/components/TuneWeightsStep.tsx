'use client';

import { useEffect, useId, useState } from 'react';
import { localDate } from '@/features/gym/use-gym-bootstrap';
import { NextTargetText } from '@/features/trainer/components/NextSessionPanel';
import { useTrainerUnit } from '@/features/trainer/use-trainer-unit';
import { showAppToast } from '@/lib/app-toast';
import { trpc } from '@/lib/trpc';
import {
  GYM_MAX_WEIGHT_KG,
  TEMPLATE_COPY,
  type TrainerRoutineExerciseDto,
  type WeightUnit,
  type WorkoutTemplateDto,
} from '@chefer/types';
import { Button } from '@chefer/ui';
import { formatLoad, kgToUnit, unitLabel, unitToKg, userFacingErrorMessage } from '@chefer/utils';

// ─── "Set weights for each client" (trainer-mode.md §6.6 Tune per client) ─────
// One client at a time: each strength exercise of the day the template became
// shows the client's own suggestion (from their history, with any target
// already set) next to the template's starting weight. A changed weight is
// saved as that client's next-session target (`trainer.client.setNextTarget`,
// the existing override); unchanged rows are left alone.

const copy = TEMPLATE_COPY.tune;

export interface TuneClient {
  clientId: string;
  name: string;
  /** The day the template was copied to. */
  routineDayId: string;
}

type TuneRow = TrainerRoutineExerciseDto & { next: NonNullable<TrainerRoutineExerciseDto['next']> };

function displayKg(kg: number, unit: WeightUnit): string {
  return String(kgToUnit(kg, unit));
}

function WeightInput({
  row,
  name,
  unit,
  value,
  onChange,
}: {
  row: TuneRow;
  name: string;
  unit: WeightUnit;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-gray-700">
        Weight ({unitLabel(unit)})<span className="sr-only">: {name}</span>
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="next"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-28 min-w-0 rounded-md border border-gray-200 px-2 text-base focus:border-gray-400 focus:outline-none sm:text-sm"
        data-testid={`tune-weight-${row.exerciseId}`}
      />
    </div>
  );
}

/** Weight typed in the trainer's unit → kg, or null when it is not a weight. */
function parseWeight(text: string, unit: WeightUnit): number | null {
  const value = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(value)) return null;
  const kg = unitToKg(value, unit);
  return kg < 0 || kg > GYM_MAX_WEIGHT_KG ? null : kg;
}

export function TuneWeightsStep({
  template,
  clients,
  onDone,
}: {
  template: WorkoutTemplateDto;
  clients: TuneClient[];
  onDone: () => void;
}) {
  const unit = useTrainerUnit();
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const client = clients[index];
  const isLast = index >= clients.length - 1;

  const routine = trpc.trainer.client.routine.useQuery(
    { clientId: client?.clientId ?? '', today: localDate() },
    { enabled: client !== undefined, retry: false },
  );
  const library = trpc.gym.library.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  const setTarget = trpc.trainer.client.setNextTarget.useMutation({ meta: { silent: true } });

  const day = routine.data?.days.find((d) => d.id === client?.routineDayId) ?? null;
  const rows: TuneRow[] = (day?.exercises ?? []).flatMap((row) =>
    row.next ? [{ ...row, next: row.next }] : [],
  );
  const metaOf = (exerciseId: string) =>
    library.data?.find((e) => e.id === exerciseId) ??
    template.exerciseMeta.find((e) => e.id === exerciseId) ??
    routine.data?.exercises.find((e) => e.id === exerciseId);

  // Each client starts from their own suggestion.
  useEffect(() => {
    setValues(
      Object.fromEntries(
        rows.map((row) => [row.id, displayKg(row.next.suggestion.weightKg, unit)]),
      ),
    );
    // Only when the client (or their loaded day) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.clientId, day?.id, unit]);

  const advance = () => {
    setValues({});
    if (isLast) onDone();
    else setIndex((i) => i + 1);
  };

  const saveAndAdvance = async () => {
    if (!client) return;
    const changed = rows.flatMap((row) => {
      const kg = parseWeight(values[row.id] ?? '', unit);
      if (kg === null || displayKg(kg, unit) === displayKg(row.next.suggestion.weightKg, unit)) {
        return [];
      }
      const reps =
        row.next.suggestion.reps.length > 0
          ? row.next.suggestion.reps
          : Array.from({ length: row.sets }, () => row.repMin);
      return [{ row, kg, reps }];
    });
    if (changed.length > 0) {
      setSaving(true);
      try {
        await Promise.all(
          changed.map(({ row, kg, reps }) =>
            setTarget.mutateAsync({
              clientId: client.clientId,
              exerciseId: row.exerciseId,
              repBucket: row.next.repBucket,
              weightKg: kg,
              reps,
            }),
          ),
        );
      } catch (err) {
        showAppToast({ message: userFacingErrorMessage(err) });
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    advance();
  };

  if (!client) return null;

  return (
    <div className="flex flex-col gap-4 px-5 py-4" data-testid="tune-step">
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <h3 className="min-w-0 break-words font-semibold text-gray-900">{client.name}</h3>
        <span className="shrink-0 text-xs text-gray-500">
          {copy.step(index + 1, clients.length)}
        </span>
      </div>

      {routine.isLoading ? (
        <div className="h-24 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600">{copy.noWeightedExercises}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {rows.map((row) => {
            const meta = metaOf(row.exerciseId);
            const name = meta?.name ?? row.exerciseId;
            const load = {
              loadType: meta?.loadType ?? 'WEIGHTED',
              perHand: meta?.perHand ?? false,
            };
            const templateKg =
              template.exercises.find((e) => e.exerciseId === row.exerciseId)?.defaultLoadKg ??
              null;
            return (
              <li
                key={row.id}
                className="flex min-w-0 flex-wrap items-end justify-between gap-3 py-3"
                data-testid="tune-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="min-w-0 break-words text-sm font-medium text-gray-900">{name}</p>
                  <p className="min-w-0 break-words text-xs text-gray-600">
                    {row.next.lastDoneDate ? (
                      <NextTargetText
                        next={row.next}
                        unit={unit}
                        load={load}
                        timed={meta?.isTimed ?? false}
                      />
                    ) : (
                      copy.noHistory
                    )}
                  </p>
                  {templateKg !== null && (
                    <p className="text-xs text-gray-500">
                      {copy.templateDefault(
                        formatLoad(templateKg, unit, load.loadType, { each: load.perHand }),
                      )}
                    </p>
                  )}
                </div>
                <WeightInput
                  row={row}
                  name={name}
                  unit={unit}
                  value={values[row.id] ?? ''}
                  onChange={(value) => setValues((prev) => ({ ...prev, [row.id]: value }))}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={advance} disabled={saving}>
          {copy.skip}
        </Button>
        <Button type="button" onClick={() => void saveAndAdvance()} loading={saving}>
          {isLast ? copy.done : copy.next}
        </Button>
      </div>
    </div>
  );
}
