import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, View, type TextInput } from 'react-native';
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
import {
  Button,
  ChipGroup,
  EmptyState,
  ErrorState,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Stepper,
  Text,
  useFieldChain,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { isTimedFor, trackingTypeOf, userFacingErrorMessage } from '@chefer/utils';
import { useFlags } from '../../../hooks/use-flags';
import { trpc } from '../../../lib/trpc';
import { useGymBootstrapLoad } from '../components/gym-bootstrap-state';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { EQUIPMENT_FILTERS } from './exercise-filters';
import {
  EXERCISE_CUE_MAX,
  EXERCISE_NAME_MAX,
  exerciseFormErrors,
  MAX_PRIMARY_MUSCLES,
  MAX_SECONDARY_MUSCLES,
  type ExerciseFormErrors,
  type ExerciseFormField,
} from './exercise-form-errors';
import { useIsOnline } from './online-status';
import { StackBackButton } from './stack-back-button';

// Custom exercise form (gym_plan.md §1.3): name, category, equipment, load
// type, primary/secondary muscles, rep range, rest, timed toggle, up to 6
// cues. Validated with the shared Zod schema; online only (createCustom /
// updateCustom).

const CATEGORY_OPTIONS = Object.values(ExerciseCategory).map((v) => ({
  value: v,
  label: v === 'COMPOUND' ? 'Compound' : 'Isolation',
}));

const LOAD_TYPE_OPTIONS = Object.values(ExerciseLoadType).map((v) => ({
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

const MUSCLE_OPTIONS = MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }));

const MAX_CUES = 6;

// T-42.3 (UX-42 (7), AC8): "How do you track it?" replaces the old
// `isTimed` checkbox — isTimed is now DERIVED from the choice (isTimedFor),
// never a separate field a client can leave inconsistent with trackingType.
// A single-select, non-empty ChipGroup (no `allowEmpty`) is what makes a
// tracking type required on this form, even though the wire schema keeps it
// optional for old clients that only ever send `isTimed`.
const TRACKING_TYPE_OPTIONS: { value: ExerciseTrackingType; label: string }[] = [
  { value: ExerciseTrackingType.WEIGHT_REPS, label: 'Weight × reps' },
  { value: ExerciseTrackingType.BODYWEIGHT_REPS, label: 'Reps only' },
  { value: ExerciseTrackingType.DURATION, label: 'Time' },
  { value: ExerciseTrackingType.DURATION_DISTANCE, label: 'Time + distance' },
  { value: ExerciseTrackingType.DISTANCE, label: 'Distance' },
];

interface FormState {
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

const DEFAULT_STATE: FormState = {
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

function stateFrom(existing: ExerciseDto | undefined, initialName: string): FormState {
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

export function ExerciseFormScreen({
  exerciseId,
  initialName = '',
}: {
  exerciseId?: string;
  /** UX-GYM-21: a name carried over from an empty search ("Create 'T-bar'"). */
  initialName?: string;
}) {
  const isEdit = exerciseId !== undefined;
  const bootstrapQuery = useGymBootstrap();
  const bootstrap = bootstrapQuery.data;
  const { load, retry } = useGymBootstrapLoad(bootstrapQuery);
  const existing = isEdit ? bootstrap?.library.find((e) => e.id === exerciseId) : undefined;

  if (isEdit && !existing) {
    // UX-GYM-21: editing right after creating used to seed the form with the
    // DEFAULTS (the cached library lacked the new exercise for a moment) and a
    // save then overwrote it. The form only mounts once the exercise is known;
    // until then (library still refreshing) this waits, and a failed load
    // offers Retry instead of "not found".
    const waiting = load === 'loading' || (load === 'data' && bootstrapQuery.isFetching);
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="px-4 pt-2">
          <StackBackButton testID="gym-exercise-form-title-back" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          {waiting ? (
            <ActivityIndicator testID="exercise-form-loading" size="large" color="#944a00" />
          ) : load === 'error' || load === 'offline' ? (
            <ErrorState
              testID="exercise-form-load-error"
              title="Couldn’t load this exercise"
              onRetry={retry}
            />
          ) : (
            <EmptyState
              testID="exercise-form-not-found"
              title="Exercise not found"
              description="It may have been archived already."
            />
          )}
        </View>
      </Screen>
    );
  }

  return (
    <ExerciseForm
      key={exerciseId ?? 'new'}
      exerciseId={exerciseId}
      existing={existing}
      initialName={initialName}
    />
  );
}

function ExerciseForm({
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

  const [state, setState] = useState<FormState>(() => stateFrom(existing, initialName));
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

  // Keyboard avoidance (dogfood #2): the Name field dismisses on submit; the
  // cues list chains Next/Done like the setup wizard's weights list (plain
  // text keyboard, so no NumericReturnBar needed — it already has a Return
  // key on both platforms).
  const nameRef = useRef<TextInput>(null);
  const cuesChain = useFieldChain(state.cues.length);
  const scrollFieldIntoView = useScrollFieldIntoView();

  const secondaryOptions = useMemo(
    () => MUSCLE_OPTIONS.filter((o) => !state.primaryMuscles.includes(o.value)),
    [state.primaryMuscles],
  );

  const setCue = (index: number, value: string) => {
    setState((s) => {
      const cues = [...s.cues];
      cues[index] = value;
      return { ...s, cues };
    });
  };
  const addCue = () =>
    setState((s) => (s.cues.length >= MAX_CUES ? s : { ...s, cues: [...s.cues, ''] }));
  const removeCue = (index: number) =>
    setState((s) => ({ ...s, cues: s.cues.filter((_, i) => i !== index) }));

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

  if (isEdit && !existing) {
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="px-4 pt-2">
          <StackBackButton testID="gym-exercise-form-title-back" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState
            testID="exercise-form-not-found"
            title="Exercise not found"
            description="It may have been archived already."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerClassName="gap-4 px-4 pb-8 pt-2"
        testID="gym-exercise-form"
      >
        <View className="flex-row items-center gap-3">
          <StackBackButton testID="gym-exercise-form-title-back" />
          <Text testID="gym-exercise-form-title" variant="title">
            {isEdit ? 'Edit exercise' : 'New exercise'}
          </Text>
        </View>

        <View>
          <Text variant="label" className="mb-1">
            Name
          </Text>
          <Input
            ref={nameRef}
            testID="exercise-form-name"
            value={state.name}
            onChangeText={(name) => {
              setState((s) => ({ ...s, name }));
              clearError('name');
            }}
            onFocus={() => scrollFieldIntoView(nameRef.current)}
            placeholder="e.g. Cable pull-through"
            accessibilityLabel="Exercise name"
            maxLength={EXERCISE_NAME_MAX}
            aria-invalid={errors.fields.name !== undefined}
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          <FieldError testID="exercise-form-error-name" message={errors.fields.name} />
        </View>

        <View>
          <Text variant="label" className="mb-1">
            Category
          </Text>
          <ChipGroup
            testID="exercise-form-category"
            options={CATEGORY_OPTIONS}
            value={[state.category]}
            onChange={(v) => {
              const category = v[0];
              if (category) setState((s) => ({ ...s, category }));
            }}
          />
        </View>

        <View>
          <Text variant="label" className="mb-1">
            Equipment
          </Text>
          <ChipGroup
            testID="exercise-form-equipment"
            options={EQUIPMENT_FILTERS}
            value={[state.equipment]}
            onChange={(v) => {
              const equipment = v[0];
              if (equipment) setState((s) => ({ ...s, equipment }));
            }}
          />
        </View>

        <View>
          <Text variant="label" className="mb-1">
            Load type
          </Text>
          <ChipGroup
            testID="exercise-form-load-type"
            options={LOAD_TYPE_OPTIONS}
            value={[state.loadType]}
            onChange={(v) => {
              const loadType = v[0];
              if (loadType) setState((s) => ({ ...s, loadType }));
            }}
          />
        </View>

        <View>
          <Text variant="label" className="mb-1">
            Primary muscles
          </Text>
          <ChipGroup
            testID="exercise-form-primary-muscles"
            options={MUSCLE_OPTIONS}
            value={state.primaryMuscles}
            multiple
            onChange={(primaryMuscles) => {
              // The schema allows 4; say so instead of silently ignoring the tap.
              if (primaryMuscles.length > MAX_PRIMARY_MUSCLES) {
                setFieldError(
                  'primaryMuscles',
                  `Pick up to ${String(MAX_PRIMARY_MUSCLES)} primary muscles.`,
                );
                return;
              }
              clearError('primaryMuscles');
              setState((s) => ({
                ...s,
                primaryMuscles,
                secondaryMuscles: s.secondaryMuscles.filter((m) => !primaryMuscles.includes(m)),
              }));
            }}
          />
          <FieldError
            testID="exercise-form-error-primary-muscles"
            message={errors.fields.primaryMuscles}
          />
        </View>

        <View>
          <Text variant="label" className="mb-1">
            Secondary muscles
          </Text>
          <ChipGroup
            testID="exercise-form-secondary-muscles"
            options={secondaryOptions}
            value={state.secondaryMuscles}
            multiple
            onChange={(secondaryMuscles) => {
              if (secondaryMuscles.length > MAX_SECONDARY_MUSCLES) {
                setFieldError(
                  'secondaryMuscles',
                  `Pick up to ${String(MAX_SECONDARY_MUSCLES)} secondary muscles.`,
                );
                return;
              }
              clearError('secondaryMuscles');
              setState((s) => ({ ...s, secondaryMuscles }));
            }}
          />
          <FieldError
            testID="exercise-form-error-secondary-muscles"
            message={errors.fields.secondaryMuscles}
          />
        </View>

        <View className="flex-row items-center justify-between">
          <View>
            <Text variant="label" className="mb-1">
              Rep range
            </Text>
            <View className="flex-row items-center gap-3">
              <Stepper
                testID="exercise-form-rep-min"
                accessibilityLabel="Minimum reps"
                value={state.repMin}
                min={1}
                max={state.repMax}
                onChange={(repMin) => setState((s) => ({ ...s, repMin }))}
              />
              <Text variant="muted">to</Text>
              <Stepper
                testID="exercise-form-rep-max"
                accessibilityLabel="Maximum reps"
                value={state.repMax}
                min={state.repMin}
                max={100}
                onChange={(repMax) => setState((s) => ({ ...s, repMax }))}
              />
            </View>
            <FieldError testID="exercise-form-error-reps" message={errors.fields.reps} />
          </View>
        </View>

        <View>
          <Text variant="label" className="mb-1">
            Rest
          </Text>
          <Stepper
            testID="exercise-form-rest"
            accessibilityLabel="Rest seconds"
            value={state.restSec}
            step={15}
            min={15}
            max={900}
            format={(v) => `${v}s`}
            onChange={(restSec) => setState((s) => ({ ...s, restSec }))}
          />
        </View>

        {cardioLogging ? (
          <View>
            <Text variant="label" className="mb-1">
              How do you track it?
            </Text>
            <ChipGroup
              testID="exercise-form-tracking-type"
              options={TRACKING_TYPE_OPTIONS}
              value={[state.trackingType]}
              onChange={(v) => {
                const trackingType = v[0];
                if (trackingType) setState((s) => ({ ...s, trackingType }));
              }}
            />
          </View>
        ) : (
          // cardioLogging off: the pre-T-42.3 single "Timed exercise" chip —
          // toggles between the only two trackingType values it ever sent
          // (WEIGHT_REPS/DURATION); onSubmit omits trackingType entirely.
          <ChipGroup
            testID="exercise-form-timed"
            options={[{ value: 'timed', label: 'Timed exercise (seconds, not reps)' }]}
            value={isTimedFor(state.trackingType) ? ['timed'] : []}
            allowEmpty
            onChange={(v) =>
              setState((s) => ({
                ...s,
                trackingType:
                  v.length > 0 ? ExerciseTrackingType.DURATION : ExerciseTrackingType.WEIGHT_REPS,
              }))
            }
          />
        )}

        <View>
          <View className="mb-1 flex-row items-center justify-between">
            <Text variant="label">Cues (optional, up to {MAX_CUES})</Text>
            {state.cues.length < MAX_CUES ? (
              <Button testID="exercise-form-add-cue" size="sm" variant="secondary" onPress={addCue}>
                + Cue
              </Button>
            ) : null}
          </View>
          {state.cues.map((cue, i) => (
            <View key={i} className="mb-2 flex-row items-center gap-2">
              <Input
                testID={`exercise-form-cue-${i}`}
                value={cue}
                onChangeText={(text) => {
                  setCue(i, text);
                  clearError('cues');
                }}
                placeholder={`Cue ${i + 1}`}
                accessibilityLabel={`Cue ${i + 1}`}
                maxLength={EXERCISE_CUE_MAX}
                className="flex-1"
                {...cuesChain.bind(i, { onFocus: scrollFieldIntoView })}
              />
              <Button
                testID={`exercise-form-remove-cue-${i}`}
                size="icon"
                variant="ghost"
                onPress={() => removeCue(i)}
                accessibilityLabel={`Remove cue ${i + 1}`}
              >
                ✕
              </Button>
            </View>
          ))}
        </View>

        <FieldError testID="exercise-form-error-cues" message={errors.fields.cues} />
        <FieldError testID="exercise-form-error-rest" message={errors.fields.rest} />

        {errors.form ? (
          <View testID="exercise-form-errors">
            <Text accessibilityRole="alert" className="text-sm text-red-600">
              {errors.form}
            </Text>
          </View>
        ) : null}

        {!online ? (
          <View testID="exercise-form-offline" className="rounded-lg bg-amber-50 px-3 py-2">
            <Text className="text-sm text-amber-900">
              Saving a custom exercise needs a connection. Reconnect to save.
            </Text>
          </View>
        ) : null}

        <Button
          testID="exercise-form-submit"
          loading={isSaving}
          disabled={!online}
          onPress={onSubmit}
        >
          {isEdit ? 'Save changes' : 'Create exercise'}
        </Button>
      </KeyboardAwareScrollView>
    </Screen>
  );
}

/** A plain-language error under the field it belongs to. */
function FieldError({ testID, message }: { testID: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <Text
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="mt-1 text-sm text-red-600"
    >
      {message}
    </Text>
  );
}
