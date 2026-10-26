'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, FileUp } from 'lucide-react';
import {
  MUSCLE_LABELS,
  MUSCLES,
  WORKOUT_IMPORT_MAX_CHARS,
  type ExerciseDto,
  type Muscle,
  type WeightUnit,
  type WorkoutImportAction,
  type WorkoutImportExerciseRowDto,
  type WorkoutImportPreviewDto,
  type WorkoutImportResultDto,
} from '@chefer/types';
import { Button } from '@chefer/ui';
import {
  cn,
  WORKOUT_IMPORT_COPY as COPY,
  deviceTimeZone,
  formatDateRange,
  importResultDetails,
  importResultHeadline,
  importRowDetail,
  importWorkoutsBucket,
  userFacingErrorMessage,
  WORKOUT_IMPORT_SOURCE_LABELS,
} from '@chefer/utils';
import { ExercisePickerSheet } from '../shared/exercise-picker-sheet';
import { CardLabel, GymCard } from '../shared/gym-card';
import { useGymData } from '../shared/use-gym-data';

// ─── /gym/import: workouts from Strong or Hevy (G2, market review 2026-10) ────
// choose a file → (older Strong files: kg or lb?) → review every exercise name
// (matched ones folded away; doubtful and unknown ones first) → import → done.
// Both server steps are stateless: the file text goes to preview and commit.
// Mobile has no file picker in the current binary — mobile_parity_backlog.md
// (lane C); the copy and rules are shared in @chefer/utils workout-import-copy.

type Ready = Extract<WorkoutImportPreviewDto, { status: 'ready' }>;

type Step =
  | { kind: 'choose'; error: string | null }
  | { kind: 'unit'; csv: string; source: Ready['source'] }
  | { kind: 'review'; csv: string; weightUnit: WeightUnit | undefined; preview: Ready }
  | { kind: 'done'; result: WorkoutImportResultDto; reimport: boolean };

/** What each review row will do — keyed by the file's exercise name. */
type Choice =
  | { type: 'existing'; exerciseId: string; name: string }
  | { type: 'create'; primaryMuscle: Muscle }
  | { type: 'skip' };

function defaultChoice(row: WorkoutImportExerciseRowDto): Choice {
  return row.exerciseId && row.exerciseName
    ? { type: 'existing', exerciseId: row.exerciseId, name: row.exerciseName }
    : { type: 'create', primaryMuscle: row.suggestedMuscle };
}

const toAction = (choice: Choice): WorkoutImportAction =>
  choice.type === 'existing' ? { type: 'existing', exerciseId: choice.exerciseId } : choice;

/** Local dates (YYYY-MM-DD) read as UTC midnight, so format them in UTC to keep the day. */
const dateRange = (first: string, last: string) =>
  formatDateRange(first, last, 'medium', { timeZone: 'UTC' });

function errorText(err: unknown): string {
  const code = (err as { data?: { code?: unknown } | null } | null)?.data?.code;
  if (code === 'TOO_MANY_REQUESTS') return COPY.tooSoon;
  return userFacingErrorMessage(err, COPY.failed);
}

export function ImportView() {
  const [step, setStep] = useState<Step>({ kind: 'choose', error: null });
  const preview = trpc.gym.import.preview.useMutation({ meta: { silent: true } });

  async function runPreview(csv: string, weightUnit?: WeightUnit) {
    try {
      const result = await preview.mutateAsync({ csv, ...(weightUnit && { weightUnit }) });
      if (result.status === 'needs_unit') setStep({ kind: 'unit', csv, source: result.source });
      else if (result.status === 'invalid')
        setStep({ kind: 'choose', error: COPY.invalid[result.reason] });
      else setStep({ kind: 'review', csv, weightUnit, preview: result });
    } catch (err) {
      setStep({ kind: 'choose', error: errorText(err) });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <Link
        href="/gym/settings"
        className="-ml-2 mb-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-gray-600 hover:bg-gray-100"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Gym settings
      </Link>
      <h1 className="font-serif text-2xl font-bold text-neutral-900">{COPY.title}</h1>
      <div className="mt-6 flex flex-col gap-4">
        {step.kind === 'choose' && (
          <ChooseFile
            busy={preview.isPending}
            error={step.error}
            onFile={(csv) => void runPreview(csv)}
            onError={(error) => setStep({ kind: 'choose', error })}
          />
        )}
        {step.kind === 'unit' && (
          <ChooseUnit
            source={step.source}
            busy={preview.isPending}
            onPick={(unit) => void runPreview(step.csv, unit)}
          />
        )}
        {step.kind === 'review' && (
          <Review
            csv={step.csv}
            weightUnit={step.weightUnit}
            preview={step.preview}
            onDone={(result) =>
              setStep({ kind: 'done', result, reimport: step.preview.alreadyImported > 0 })
            }
          />
        )}
        {step.kind === 'done' && <Done result={step.result} />}
      </div>
    </div>
  );
}

function ChooseFile({
  busy,
  error,
  onFile,
  onError,
}: {
  busy: boolean;
  error: string | null;
  onFile: (csv: string) => void;
  onError: (message: string) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  return (
    <GymCard>
      <p className="text-sm text-gray-700">{COPY.intro}</p>
      <ul className="mt-3 space-y-1 text-sm text-gray-600">
        <li>{COPY.howTo.STRONG}</li>
        <li>{COPY.howTo.HEVY}</li>
      </ul>
      <label
        htmlFor={inputId}
        className={cn(
          'mt-4 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-sm font-medium text-gray-800 hover:bg-gray-50',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        <FileUp className="h-5 w-5" aria-hidden="true" />
        {busy ? COPY.reading : COPY.chooseFile}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        disabled={busy}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        data-testid="gym-import-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void file.text().then((csv) => {
            if (csv.length > WORKOUT_IMPORT_MAX_CHARS) onError(COPY.tooBig);
            else onFile(csv);
          });
        }}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </GymCard>
  );
}

function ChooseUnit({
  source,
  busy,
  onPick,
}: {
  source: Ready['source'];
  busy: boolean;
  onPick: (unit: WeightUnit) => void;
}) {
  return (
    <GymCard>
      <CardLabel>{WORKOUT_IMPORT_SOURCE_LABELS[source]}</CardLabel>
      <h2 className="mt-1 text-base font-semibold text-gray-900">{COPY.unitQuestion}</h2>
      <p className="mt-1 text-sm text-gray-600">{COPY.unitWhy}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button variant="outline" disabled={busy} onClick={() => onPick('KG')}>
          Kilograms (kg)
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => onPick('LB')}>
          Pounds (lb)
        </Button>
      </div>
    </GymCard>
  );
}

function Review({
  csv,
  weightUnit,
  preview,
  onDone,
}: {
  csv: string;
  weightUnit: WeightUnit | undefined;
  preview: Ready;
  onDone: (result: WorkoutImportResultDto) => void;
}) {
  const utils = trpc.useUtils();
  const { data } = useGymData();
  const library = data?.library ?? [];
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(preview.exercises.map((row) => [row.name, defaultChoice(row)])),
  );
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = trpc.gym.import.commit.useMutation({ meta: { silent: true } });

  const attention = preview.exercises.filter((r) => r.status !== 'matched');
  const matched = preview.exercises.filter((r) => r.status === 'matched');
  const toImport = preview.workouts - preview.alreadyImported;
  const setChoice = (name: string, choice: Choice) =>
    setChoices((prev) => ({ ...prev, [name]: choice }));

  async function submit() {
    setError(null);
    try {
      const result = await commit.mutateAsync({
        csv,
        ...(weightUnit && { weightUnit }),
        timeZone: deviceTimeZone(),
        mappings: Object.entries(choices).map(([name, choice]) => ({
          name,
          action: toAction(choice),
        })),
      });
      capture('workout_import_completed', {
        source: result.source === 'STRONG' ? 'strong' : 'hevy',
        workoutsBucket: importWorkoutsBucket(result.imported),
        createdExercises: result.createdExercises,
        reimport: preview.alreadyImported > 0,
      });
      // History, stats, PRs and the next suggestions all read sessions.
      await utils.gym.invalidate();
      onDone(result);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <GymCard data-testid="gym-import-summary">
        <CardLabel>{WORKOUT_IMPORT_SOURCE_LABELS[preview.source]}</CardLabel>
        <p className="mt-1 text-lg font-semibold text-gray-900">
          {preview.workouts} {preview.workouts === 1 ? 'workout' : 'workouts'} · {preview.sets} sets
        </p>
        <p className="text-sm text-gray-600">
          {dateRange(preview.firstDate, preview.lastDate)} · weights in{' '}
          {preview.weightUnit === 'LB' ? 'pounds' : 'kilograms'}
        </p>
        {preview.alreadyImported > 0 && (
          <p className="mt-2 text-sm text-gray-700">
            {toImport === 0
              ? COPY.allThere
              : `${preview.alreadyImported} of these are already in Chefer and will be left as they are.`}
          </p>
        )}
      </GymCard>

      {attention.length > 0 && (
        <GymCard>
          <h2 className="text-base font-semibold text-gray-900">{COPY.needsAttention}</h2>
          <ul className="mt-2 divide-y">
            {attention.map((row) => (
              <ReviewRow
                key={row.name}
                row={row}
                choice={choices[row.name] ?? defaultChoice(row)}
                onChoose={(c) => setChoice(row.name, c)}
                onPickOther={() => setPicking(row.name)}
              />
            ))}
          </ul>
        </GymCard>
      )}

      {matched.length > 0 && (
        <GymCard>
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-gray-900">
              {COPY.matchedAuto} ({matched.length})
            </summary>
            <ul className="mt-2 divide-y">
              {matched.map((row) => (
                <ReviewRow
                  key={row.name}
                  row={row}
                  choice={choices[row.name] ?? defaultChoice(row)}
                  onChoose={(c) => setChoice(row.name, c)}
                  onPickOther={() => setPicking(row.name)}
                />
              ))}
            </ul>
          </details>
        </GymCard>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button
        className="w-full sm:w-auto sm:self-end"
        disabled={commit.isPending || toImport === 0}
        onClick={() => void submit()}
        data-testid="gym-import-submit"
      >
        {commit.isPending
          ? COPY.importing
          : toImport === 0
            ? COPY.nothingNew
            : `Import ${toImport} ${toImport === 1 ? 'workout' : 'workouts'}`}
      </Button>

      <ExercisePickerSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        library={library}
        onPick={(exercise: ExerciseDto) => {
          if (picking)
            setChoice(picking, { type: 'existing', exerciseId: exercise.id, name: exercise.name });
          setPicking(null);
        }}
      />
    </>
  );
}

const CREATE = '__create__';
const SKIP = '__skip__';
const PICK = '__pick__';

function ReviewRow({
  row,
  choice,
  onChoose,
  onPickOther,
}: {
  row: WorkoutImportExerciseRowDto;
  choice: Choice;
  onChoose: (choice: Choice) => void;
  onPickOther: () => void;
}) {
  const selectId = useId();
  const muscleId = useId();
  // Every exercise this row can map to: the match, the alternatives, and one
  // picked from the library (kept as an option once chosen).
  const options = useMemo(() => {
    const list = [
      ...(row.exerciseId && row.exerciseName
        ? [{ id: row.exerciseId, name: row.exerciseName }]
        : []),
      ...row.alternatives,
    ];
    if (choice.type === 'existing' && !list.some((o) => o.id === choice.exerciseId)) {
      list.unshift({ id: choice.exerciseId, name: choice.name });
    }
    return list;
  }, [row, choice]);
  const value =
    choice.type === 'existing' ? choice.exerciseId : choice.type === 'create' ? CREATE : SKIP;

  return (
    <li className="py-3" data-testid={`gym-import-row-${row.name}`}>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <label htmlFor={selectId} className="block break-words font-medium text-gray-900">
            {row.name}
          </label>
          <p className="text-xs text-gray-500">
            {importRowDetail(row)}
            {row.status === 'suggested' ? ' · best guess, please check' : ''}
          </p>
        </div>
        <select
          id={selectId}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === PICK) onPickOther();
            else if (v === CREATE) onChoose({ type: 'create', primaryMuscle: row.suggestedMuscle });
            else if (v === SKIP) onChoose({ type: 'skip' });
            else
              onChoose({
                type: 'existing',
                exerciseId: v,
                name: options.find((o) => o.id === v)?.name ?? v,
              });
          }}
          className="min-h-11 w-full rounded-lg border bg-white px-3 text-sm sm:w-64"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value={PICK}>{COPY.pickOther}</option>
          <option value={CREATE}>{COPY.createOwn}</option>
          <option value={SKIP}>{COPY.skip}</option>
        </select>
      </div>
      {choice.type === 'create' && (
        <div className="mt-2 flex items-center gap-2 sm:justify-end">
          <label htmlFor={muscleId} className="text-xs text-gray-600">
            {COPY.mainMuscle}
          </label>
          <select
            id={muscleId}
            value={choice.primaryMuscle}
            onChange={(e) => onChoose({ type: 'create', primaryMuscle: e.target.value as Muscle })}
            className="min-h-11 rounded-lg border bg-white px-3 text-sm"
          >
            {MUSCLES.map((m) => (
              <option key={m} value={m}>
                {MUSCLE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}

function Done({ result }: { result: WorkoutImportResultDto }) {
  return (
    <GymCard data-testid="gym-import-done">
      <h2 className="text-lg font-semibold text-gray-900">{importResultHeadline(result)}</h2>
      {result.firstDate && result.lastDate && result.imported > 0 && (
        <p className="text-sm text-gray-600">{dateRange(result.firstDate, result.lastDate)}</p>
      )}
      {importResultDetails(result).map((line) => (
        <p key={line} className="mt-1 text-sm text-gray-700">
          {line}
        </p>
      ))}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/gym/history"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-gray-50"
        >
          See your history
        </Link>
        <Link
          href="/gym/stats"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-gray-50"
        >
          See your progress
        </Link>
      </div>
    </GymCard>
  );
}
