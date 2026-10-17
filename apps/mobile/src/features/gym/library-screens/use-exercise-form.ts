import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  customExerciseInputSchema,
  ExerciseCategory,
  ExerciseLoadType,
  ExerciseTrackingType,
  MUSCLE_LABELS,
  MUSCLES,
  type CustomExerciseInput,
  type ExerciseDto,
  type Muscle,
} from '@chefer/types';
import { isTimedFor, trackingTypeOf, userFacingErrorMessage } from '@chefer/utils';
import { useFlags } from '../../../hooks/use-flags';
import { trpc } from '../../../lib/trpc';
import { useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { useGymBootstrap } from '../use-gym-bootstrap';
import {
  exerciseFormErrors,
  MAX_PRIMARY_MUSCLES,
  MAX_SECONDARY_MUSCLES,
  type ExerciseFormErrors,
  type ExerciseFormField,
} from './exercise-form-errors';
import { useIsOnline } from './online-status';

// The custom-exercise form's state, rules and save (gym_plan.md §1.3), shared
// by the legacy `ExerciseFormScreen` and the 10 Oct redesign's
// `ExerciseFormV2` so both renders validate, save, invalidate and navigate
// the same way. Extracted unchanged from exercise-form-screen.tsx.

export const CATEGORY_OPTIONS = Object.values(ExerciseCategory).map((v) => ({
  value: v,
  label: v === 'COMPOUND' ? 'Compound' : 'Isolation',
}));

export const LOAD_TYPE_OPTIONS = Object.values(ExerciseLoadType).map((v) => ({
  value: v,
  label:
    v === 'WEIGHTED'
      ? 'Weighted'
      : v === 'BODYWEIGHT'
        ? 'Bodyweight'
        : v === 'BODYWEIGHT_PLUS'
          ? 'Bodyweight + load'
          : 'Assisted',
}));

export const MUSCLE_OPTIONS = MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }));

export const MAX_CUES = 6;

// T-42.3 (UX-42 (7), AC8): "How do you track it?" replaces the old
// `isTimed` checkbox — isTimed is now DERIVED from the choice (isTimedFor),
// never a separate field a client can leave inconsistent with trackingType.
// A single-select, non-empty ChipGroup (no `allowEmpty`) is what makes a
// tracking type required on this form, even though the wire schema keeps it
// optional for old clients that only ever send `isTimed`.
export const TRACKING_TYPE_OPTIONS: { value: ExerciseTrackingType; label: string }[] = [
  { value: ExerciseTrackingType.WEIGHT_REPS, label: 'Weight × reps' },
  { value: ExerciseTrackingType.BODYWEIGHT_REPS, label: 'Reps only' },
  { value: ExerciseTrackingType.DURATION, label: 'Time' },
  { value: ExerciseTrackingType.DURATION_DISTANCE, label: 'Time + distance' },
  { value: ExerciseTrackingType.DISTANCE, label: 'Distance' },
];

export interface ExerciseFormState {
  name: string;
  category: (typeof ExerciseCategory)[keyof typeof ExerciseCategory];
  equipment: string;
  loadType: (typeof ExerciseLoadType)[keyof typeof ExerciseLoadType];
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  repMin: number;
  repMax: number;
  restSec: number;
  trackingType: ExerciseTrackingType;
  cues: string[];
}

const DEFAULT_STATE: ExerciseFormState = {
  name: '',
  category: 'COMPOUND',
  equipment: 'BARBELL',
  loadType: 'WEIGHTED',
  primaryMuscles: [],
  secondaryMuscles: [],
  repMin: 8,
  repMax: 12,
  restSec: 90,
  trackingType: ExerciseTrackingType.WEIGHT_REPS,
  cues: [],
};

function stateFrom(existing: ExerciseDto | undefined, initialName: string): ExerciseFormState {
  return existing
    ? {
        name: existing.name,
        category: existing.category,
        equipment: existing.equipment,
        loadType: existing.loadType,
        primaryMuscles: existing.primaryMuscles,
        secondaryMuscles: existing.secondaryMuscles,
        repMin: existing.repMin,
        repMax: existing.repMax,
        restSec: existing.restSec,
        trackingType: trackingTypeOf(existing),
        cues: existing.cues,
      }
    : { ...DEFAULT_STATE, name: initialName };
}

/**
 * Whether the form can mount yet. UX-GYM-21: editing right after creating
 * used to seed the form with the DEFAULTS (the cached library lacked the new
 * exercise for a moment) and a save then overwrote it. The form only mounts
 * once the exercise is known; until then (library still refreshing) the
 * screen waits, and a failed load offers Retry instead of "not found".
 */
export function useExerciseFormGate(exerciseId: string | undefined) {
  const isEdit = exerciseId !== undefined;
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  const { load, retry } = useGymBootstrapLoad(bootstrapQuery);
  const existing = isEdit ? bootstrap?.library.find((e) => e.id === exerciseId) : undefined;
  const missing = isEdit && !existing;
  const waiting = load === 'loading' || (load === 'data' && bootstrapQuery.isFetching);
  const failed = load === 'error' || load === 'offline';
  return { existing, missing, waiting, failed, retry };
}

export function useExerciseForm({
  exerciseId,
  existing,
  initialName,
}: {
  exerciseId: string | undefined;
  existing: ExerciseDto | undefined;
  initialName: string;
}) {
  const isEdit = exerciseId !== undefined;
  const { cardioLogging } = useFlags();
  const utils = trpc.useUtils();
  const online = useIsOnline();

  const [state, setState] = useState<ExerciseFormState>(() => stateFrom(existing, initialName));
  // UX-GYM-21: field-level errors, plus one line for a failed save.
  const [errors, setErrors] = useState<ExerciseFormErrors>({ fields: {}, form: null });
  const clearError = (field: ExerciseFormField) =>
    setErrors((prev) => {
      if (!prev.fields[field]) return prev;
      return { ...prev, fields: { ...prev.fields, [field]: undefined } };
    });
  const setFieldError = (field: ExerciseFormField, message: string) =>
    setErrors((prev) => ({ ...prev, fields: { ...prev.fields, [field]: message } }));

  const createMutation = trpc.gym.library.createCustom.useMutation({
    onSuccess: (created) => {
      void utils.gym.bootstrap.invalidate();
      router.replace(`/gym/exercise/${created.id}`);
    },
    onError: (err) => setErrors({ fields: {}, form: userFacingErrorMessage(err) }),
    // The form shows the failure itself — no second snackbar.
    meta: { silent: true },
  });
  const updateMutation = trpc.gym.library.updateCustom.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      router.back();
    },
    onError: (err) => setErrors({ fields: {}, form: userFacingErrorMessage(err) }),
    meta: { silent: true },
  });
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const secondaryOptions = useMemo(
    () => MUSCLE_OPTIONS.filter((o) => !state.primaryMuscles.includes(o.value)),
    [state.primaryMuscles],
  );

  const setName = (name: string) => {
    setState((s) => ({ ...s, name }));
    clearError('name');
  };
  const setCue = (index: number, value: string) => {
    setState((s) => {
      const cues = [...s.cues];
      cues[index] = value;
      return { ...s, cues };
    });
    clearError('cues');
  };
  const addCue = () =>
    setState((s) => (s.cues.length >= MAX_CUES ? s : { ...s, cues: [...s.cues, ''] }));
  const removeCue = (index: number) =>
    setState((s) => ({ ...s, cues: s.cues.filter((_, i) => i !== index) }));

  const setPrimaryMuscles = (primaryMuscles: Muscle[]) => {
    // The schema allows 4; say so instead of silently ignoring the tap.
    if (primaryMuscles.length > MAX_PRIMARY_MUSCLES) {
      setFieldError('primaryMuscles', `Pick up to ${String(MAX_PRIMARY_MUSCLES)} primary muscles.`);
      return;
    }
    clearError('primaryMuscles');
    setState((s) => ({
      ...s,
      primaryMuscles,
      secondaryMuscles: s.secondaryMuscles.filter((m) => !primaryMuscles.includes(m)),
    }));
  };
  const setSecondaryMuscles = (secondaryMuscles: Muscle[]) => {
    if (secondaryMuscles.length > MAX_SECONDARY_MUSCLES) {
      setFieldError(
        'secondaryMuscles',
        `Pick up to ${String(MAX_SECONDARY_MUSCLES)} secondary muscles.`,
      );
      return;
    }
    clearError('secondaryMuscles');
    setState((s) => ({ ...s, secondaryMuscles }));
  };

  const onSubmit = () => {
    const input: CustomExerciseInput = {
      name: state.name.trim(),
      category: state.category,
      equipment: state.equipment as CustomExerciseInput['equipment'],
      loadType: state.loadType,
      primaryMuscles: state.primaryMuscles,
      secondaryMuscles: state.secondaryMuscles,
      repMin: state.repMin,
      repMax: state.repMax,
      restSec: state.restSec,
      isTimed: isTimedFor(state.trackingType),
      // cardioLogging off: send the old isTimed-only shape (no trackingType)
      // — the same input a pre-T-42.3 client sends; the server derives the
      // same default from isTimed/loadType (trackingTypeOf).
      ...(cardioLogging && { trackingType: state.trackingType }),
      cues: state.cues.map((c) => c.trim()).filter((c) => c.length > 0),
    };
    const result = customExerciseInputSchema.safeParse(input);
    if (!result.success) {
      setErrors(exerciseFormErrors(result.error.issues));
      return;
    }
    setErrors({ fields: {}, form: null });
    if (isEdit && exerciseId) {
      updateMutation.mutate({ id: exerciseId, exercise: result.data });
    } else {
      createMutation.mutate(result.data);
    }
  };

  return {
    isEdit,
    cardioLogging,
    online,
    state,
    setState,
    errors,
    isSaving,
    secondaryOptions,
    setName,
    setCue,
    addCue,
    removeCue,
    setPrimaryMuscles,
    setSecondaryMuscles,
    onSubmit,
  };
}
