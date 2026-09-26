'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { trpc } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import {
  customExerciseInputSchema,
  ExerciseCategory,
  ExerciseEquipment,
  ExerciseLoadType,
  MUSCLE_LABELS,
  MUSCLES,
  type CustomExerciseInput,
  type Muscle,
} from '@chefer/types';
import { EQUIPMENT_LABELS } from './filters';
import { removeMuscle, toggleMuscle } from './muscle-select';

const CATEGORY_OPTIONS = Object.values(ExerciseCategory);
const EQUIPMENT_OPTIONS_ALL = Object.values(ExerciseEquipment);
const LOAD_TYPE_LABELS: Record<ExerciseLoadType, string> = {
  WEIGHTED: 'Weighted',
  BODYWEIGHT: 'Bodyweight',
  BODYWEIGHT_PLUS: 'Bodyweight + added load',
  ASSISTED: 'Assisted (machine reduces load)',
};

const DEFAULT_VALUES: CustomExerciseInput = {
  name: '',
  category: 'COMPOUND',
  equipment: 'BARBELL',
  loadType: 'WEIGHTED',
  primaryMuscles: [],
  secondaryMuscles: [],
  repMin: 8,
  repMax: 12,
  restSec: 120,
  isTimed: false,
  cues: [],
};

const inputClass =
  'w-full min-h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm focus:border-[#944a00] focus:outline-none focus:ring-1 focus:ring-[#944a00]';
const labelClass = 'mb-1 block text-xs font-medium text-neutral-600';

function MuscleChip({
  muscle,
  active,
  disabled,
  onClick,
}: {
  muscle: Muscle;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled && !active}
      className={`min-h-11 rounded-full border px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-[#944a00] bg-[#944a00] text-white'
          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
      }`}
    >
      {MUSCLE_LABELS[muscle]}
    </button>
  );
}

export interface ExerciseFormProps {
  mode: 'create' | 'edit';
  exerciseId?: string;
  initial?: CustomExerciseInput;
}

export function ExerciseForm({ mode, exerciseId, initial }: ExerciseFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomExerciseInput>({
    resolver: zodResolver(customExerciseInputSchema),
    defaultValues: initial ?? DEFAULT_VALUES,
  });

  const primaryMuscles = watch('primaryMuscles');
  const secondaryMuscles = watch('secondaryMuscles');
  const cues = watch('cues');
  const isTimed = watch('isTimed');

  const onSuccess = () => {
    void utils.gym.bootstrap.invalidate();
    void utils.gym.library.invalidate();
    router.push(exerciseId ? `/gym/exercises/${exerciseId}` : '/gym/exercises');
  };

  const createMutation = trpc.gym.library.createCustom.useMutation({
    onSuccess: (row) => {
      void utils.gym.bootstrap.invalidate();
      void utils.gym.library.invalidate();
      router.push(`/gym/exercises/${row.id}`);
    },
    onError: (err) => setServerError(err.message),
  });
  const updateMutation = trpc.gym.library.updateCustom.useMutation({
    onSuccess,
    onError: (err) => setServerError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const onSubmit = (data: CustomExerciseInput) => {
    setServerError(null);
    if (mode === 'edit' && exerciseId) {
      updateMutation.mutate({ id: exerciseId, exercise: data });
    } else {
      createMutation.mutate(data);
    }
  };

  const selectPrimary = (muscle: Muscle) => {
    setValue('primaryMuscles', toggleMuscle(primaryMuscles, muscle, 4), { shouldValidate: true });
    setValue('secondaryMuscles', removeMuscle(secondaryMuscles, muscle), { shouldValidate: true });
  };
  const selectSecondary = (muscle: Muscle) => {
    setValue('secondaryMuscles', toggleMuscle(secondaryMuscles, muscle, 6), {
      shouldValidate: true,
    });
    setValue('primaryMuscles', removeMuscle(primaryMuscles, muscle), { shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {serverError}
        </div>
      )}

      <div>
        <label htmlFor="name" className={labelClass}>
          Name
        </label>
        <input id="name" type="text" className={inputClass} {...register('name')} />
        {errors.name && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="category" className={labelClass}>
            Category
          </label>
          <select id="category" className={inputClass} {...register('category')}>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c === 'COMPOUND' ? 'Compound' : 'Isolation'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="equipment" className={labelClass}>
            Equipment
          </label>
          <select id="equipment" className={inputClass} {...register('equipment')}>
            {EQUIPMENT_OPTIONS_ALL.map((e) => (
              <option key={e} value={e}>
                {EQUIPMENT_LABELS[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="loadType" className={labelClass}>
          Load type
        </label>
        <select id="loadType" className={inputClass} {...register('loadType')}>
          {Object.values(ExerciseLoadType).map((lt) => (
            <option key={lt} value={lt}>
              {LOAD_TYPE_LABELS[lt]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>
          Primary muscles <span className="text-neutral-400">(up to 4)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLES.map((m) => (
            <MuscleChip
              key={m}
              muscle={m}
              active={primaryMuscles.includes(m)}
              disabled={primaryMuscles.length >= 4}
              onClick={() => selectPrimary(m)}
            />
          ))}
        </div>
        {errors.primaryMuscles && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {errors.primaryMuscles.message ?? 'Pick at least one primary muscle.'}
          </p>
        )}
      </div>

      <div>
        <label className={labelClass}>
          Secondary muscles <span className="text-neutral-400">(up to 6, optional)</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLES.filter((m) => !primaryMuscles.includes(m)).map((m) => (
            <MuscleChip
              key={m}
              muscle={m}
              active={secondaryMuscles.includes(m)}
              disabled={secondaryMuscles.length >= 6}
              onClick={() => selectSecondary(m)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isTimed"
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-300"
          {...register('isTimed')}
        />
        <label htmlFor="isTimed" className="text-sm text-neutral-700">
          Timed exercise (e.g. plank) — reps below are seconds
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="repMin" className={labelClass}>
            {isTimed ? 'Min seconds' : 'Min reps'}
          </label>
          <input
            id="repMin"
            type="number"
            min={1}
            className={inputClass}
            {...register('repMin', { valueAsNumber: true })}
          />
        </div>
        <div>
          <label htmlFor="repMax" className={labelClass}>
            {isTimed ? 'Max seconds' : 'Max reps'}
          </label>
          <input
            id="repMax"
            type="number"
            min={1}
            className={inputClass}
            {...register('repMax', { valueAsNumber: true })}
          />
        </div>
        <div>
          <label htmlFor="restSec" className={labelClass}>
            Rest (sec)
          </label>
          <input
            id="restSec"
            type="number"
            min={15}
            step={15}
            className={inputClass}
            {...register('restSec', { valueAsNumber: true })}
          />
        </div>
      </div>
      {(errors.repMin ?? errors.repMax ?? errors.root) && (
        <p className="text-xs text-red-600" role="alert">
          {errors.repMin?.message ??
            errors.repMax?.message ??
            'Min reps must be at or below max reps.'}
        </p>
      )}

      <div>
        <label className={labelClass}>
          Cues <span className="text-neutral-400">(optional, up to 6)</span>
        </label>
        <div className="space-y-2">
          {cues.map((cue, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={cue}
                onChange={(e) => {
                  const next = [...cues];
                  next[i] = e.target.value;
                  setValue('cues', next);
                }}
                maxLength={120}
                aria-label={`Cue ${i + 1}`}
                className={inputClass}
                placeholder="e.g. Drive your elbows down to your hips"
              />
              <button
                type="button"
                onClick={() =>
                  setValue(
                    'cues',
                    cues.filter((_, idx) => idx !== i),
                  )
                }
                aria-label="Remove cue"
                className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {cues.length < 6 && (
            <button
              type="button"
              onClick={() => setValue('cues', [...cues, ''])}
              className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-[#944a00] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add a cue
            </button>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="min-h-11 w-full rounded-xl bg-[#944a00] px-4 text-sm font-semibold text-white transition hover:bg-[#7a3d00] disabled:opacity-50"
      >
        {isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create exercise'}
      </button>
    </form>
  );
}
