import { useRef } from 'react';
import { ActivityIndicator, Keyboard, View, type TextInput } from 'react-native';
import { ExerciseTrackingType, type ExerciseDto } from '@chefer/types';
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
import { isTimedFor } from '@chefer/utils';
import { EQUIPMENT_FILTERS } from './exercise-filters';
import { EXERCISE_CUE_MAX, EXERCISE_NAME_MAX } from './exercise-form-errors';
import { StackBackButton } from './stack-back-button';
import {
  CATEGORY_OPTIONS,
  LOAD_TYPE_OPTIONS,
  MAX_CUES,
  MUSCLE_OPTIONS,
  TRACKING_TYPE_OPTIONS,
  useExerciseForm,
  useExerciseFormGate,
} from './use-exercise-form';

// Custom exercise form (gym_plan.md §1.3): name, category, equipment, load
// type, primary/secondary muscles, rep range, rest, timed toggle, up to 6
// cues. Validated with the shared Zod schema; online only (createCustom /
// updateCustom). State, rules and save live in `useExerciseForm` (shared with
// the redesign's ExerciseFormV2).

export function ExerciseFormScreen({
  exerciseId,
  initialName = '',
}: {
  exerciseId?: string;
  /** UX-GYM-21: a name carried over from an empty search ("Create 'T-bar'"). */
  initialName?: string;
}) {
  const { existing, missing, waiting, failed, retry } = useExerciseFormGate(exerciseId);

  if (missing) {
    // UX-GYM-21: the form only mounts once the exercise is known (see
    // useExerciseFormGate); until then this waits, and a failed load offers
    // Retry instead of "not found".
    return (
      <Screen className="px-0" edges={['top', 'bottom', 'left', 'right']}>
        <View className="px-4 pt-2">
          <StackBackButton testID="gym-exercise-form-title-back" />
        </View>
        <View className="flex-1 items-center justify-center px-6">
          {waiting ? (
            <ActivityIndicator testID="exercise-form-loading" size="large" color="#944a00" />
          ) : failed ? (
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
  const {
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
  } = useExerciseForm({ exerciseId, existing, initialName });

  // Keyboard avoidance (dogfood #2): the Name field dismisses on submit; the
  // cues list chains Next/Done like the setup wizard's weights list (plain
  // text keyboard, so no NumericReturnBar needed — it already has a Return
  // key on both platforms).
  const nameRef = useRef<TextInput>(null);
  const cuesChain = useFieldChain(state.cues.length);
  const scrollFieldIntoView = useScrollFieldIntoView();

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
            onChangeText={setName}
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
            onChange={setPrimaryMuscles}
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
            onChange={setSecondaryMuscles}
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
                onChangeText={(text) => setCue(i, text)}
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
