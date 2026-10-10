import { useRef, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, View, type TextInput } from 'react-native';
import { ExerciseTrackingType, type ExerciseDto, type Muscle } from '@chefer/types';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  KeyboardAwareScrollView,
  PressableScale,
  Screen,
  SegmentedControl,
  SelectField,
  Stepper,
  Text,
  useFieldChain,
  useScrollFieldIntoView,
  useThemeColors,
  type SelectOption,
} from '@chefer/ui-mobile';
import { isTimedFor } from '@chefer/utils';
import { Icon } from '../../../components/icon';
import { EQUIPMENT_FILTERS } from '../../gym/library-screens/exercise-filters';
import {
  EXERCISE_CUE_MAX,
  EXERCISE_NAME_MAX,
} from '../../gym/library-screens/exercise-form-errors';
import {
  CATEGORY_OPTIONS,
  LOAD_TYPE_OPTIONS,
  MAX_CUES,
  MUSCLE_OPTIONS,
  TRACKING_TYPE_OPTIONS,
  useExerciseForm,
  useExerciseFormGate,
} from '../../gym/library-screens/use-exercise-form';
import { ShellChromeProvider, ShellTopBar, type ShellChrome } from '../shell-chrome';
import { MultiSelectField } from './multi-select-field';

// ─── New / Edit exercise (10 Oct redesign, ExerciseForm board) ──────────────
// The new shell's custom-exercise form. Same state, validation, save,
// invalidation, offline gate and navigation as the legacy
// `ExerciseFormScreen` (both run `useExerciseForm`); only the layout differs.
// Owner note: too many chips — every long single choice is a `SelectField`
// dropdown and the muscle lists are `MultiSelectField`s; only the two-way
// Type stays inline, as a segmented control.

const SEGMENT_CATEGORY_OPTIONS = CATEGORY_OPTIONS.map((o) => ({
  ...o,
  testID: `exercise-form-category-${o.value}`,
}));

// cardioLogging off: the pre-T-42.3 client only ever chose between reps and
// time (legacy: one "Timed exercise" toggle). Same two values, as a dropdown;
// the save then omits trackingType exactly like the legacy form.
const TIMED_OPTIONS: readonly SelectOption<ExerciseTrackingType>[] = [
  { value: ExerciseTrackingType.WEIGHT_REPS, label: 'Reps' },
  { value: ExerciseTrackingType.DURATION, label: 'Time (seconds, not reps)' },
];

const chromeFor = (isEdit: boolean): ShellChrome => ({
  kind: 'pushed',
  fallback: '/training/exercises',
  title: isEdit ? 'Edit exercise' : 'New exercise',
});

export function ExerciseFormV2Screen({
  exerciseId,
  initialName = '',
}: {
  exerciseId?: string;
  /** UX-GYM-21: a name carried over from an empty search ("Create 'T-bar'"). */
  initialName?: string;
}) {
  const colors = useThemeColors();
  const { existing, missing, waiting, failed, retry } = useExerciseFormGate(exerciseId);
  const chrome = chromeFor(exerciseId !== undefined);

  if (missing) {
    // UX-GYM-21: wait for the library instead of seeding an edit with defaults.
    return (
      <ShellChromeProvider value={chrome}>
        <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
          <View className="px-4">
            <ShellTopBar />
          </View>
          <View className="flex-1 items-center justify-center px-6">
            {waiting ? (
              <ActivityIndicator testID="exercise-form-loading" size="large" color={colors.brand} />
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
      </ShellChromeProvider>
    );
  }

  return (
    <ShellChromeProvider value={chrome}>
      <ExerciseFormV2
        key={exerciseId ?? 'new'}
        exerciseId={exerciseId}
        existing={existing}
        initialName={initialName}
      />
    </ShellChromeProvider>
  );
}

function ExerciseFormV2({
  exerciseId,
  existing,
  initialName,
}: {
  exerciseId: string | undefined;
  existing: ExerciseDto | undefined;
  initialName: string;
}) {
  const colors = useThemeColors();
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

  // Keyboard (same as legacy): Name dismisses on Done; the cues chain Next/Done.
  const nameRef = useRef<TextInput>(null);
  const cuesChain = useFieldChain(state.cues.length);
  const scrollFieldIntoView = useScrollFieldIntoView();

  return (
    <Screen className="bg-canvas px-0" edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerClassName="gap-4 px-4 pb-8"
        testID="gym-exercise-form"
      >
        <ShellTopBar />

        <Card>
          <Field label="Name">
            <Input
              ref={nameRef}
              testID="exercise-form-name"
              value={state.name}
              onChangeText={setName}
              onFocus={() => scrollFieldIntoView(nameRef.current)}
              placeholder="e.g. Cable pull-through"
              accessibilityLabel="Exercise name"
              accessibilityHint={errors.fields.name}
              maxLength={EXERCISE_NAME_MAX}
              aria-invalid={errors.fields.name !== undefined}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <FieldError testID="exercise-form-error-name" message={errors.fields.name} />
          </Field>

          <Field label="Type">
            <SegmentedControl
              testID="exercise-form-category"
              accessibilityLabel="Type"
              options={SEGMENT_CATEGORY_OPTIONS}
              value={state.category}
              onChange={(category) => setState((s) => ({ ...s, category }))}
            />
          </Field>

          <Field label="Equipment">
            <SelectField
              testID="exercise-form-equipment"
              label="Equipment"
              options={EQUIPMENT_FILTERS}
              value={state.equipment}
              onChange={(equipment) => setState((s) => ({ ...s, equipment }))}
            />
          </Field>

          <Field label="Load">
            <SelectField
              testID="exercise-form-load-type"
              label="Load"
              options={LOAD_TYPE_OPTIONS}
              value={state.loadType}
              onChange={(loadType) => setState((s) => ({ ...s, loadType }))}
            />
          </Field>

          <Field label="How you track it">
            {cardioLogging ? (
              <SelectField
                testID="exercise-form-tracking-type"
                label="How you track it"
                options={TRACKING_TYPE_OPTIONS}
                value={state.trackingType}
                onChange={(trackingType) => setState((s) => ({ ...s, trackingType }))}
              />
            ) : (
              <SelectField
                testID="exercise-form-timed"
                label="How you track it"
                options={TIMED_OPTIONS}
                value={
                  isTimedFor(state.trackingType)
                    ? ExerciseTrackingType.DURATION
                    : ExerciseTrackingType.WEIGHT_REPS
                }
                onChange={(trackingType) => setState((s) => ({ ...s, trackingType }))}
              />
            )}
          </Field>
        </Card>

        <Card>
          <View className="gap-1">
            <FieldLabel>Main muscles</FieldLabel>
            <MultiSelectField<Muscle>
              testID="exercise-form-primary-muscles"
              label="Main muscles"
              options={MUSCLE_OPTIONS}
              value={state.primaryMuscles}
              onChange={setPrimaryMuscles}
              error={errors.fields.primaryMuscles}
            />
            <Text className="text-caption text-label-tertiary">Pick one or more</Text>
          </View>

          <Field label="Also works">
            <MultiSelectField<Muscle>
              testID="exercise-form-secondary-muscles"
              label="Also works"
              placeholder="Optional"
              options={secondaryOptions}
              value={state.secondaryMuscles}
              onChange={setSecondaryMuscles}
              error={errors.fields.secondaryMuscles}
            />
          </Field>
        </Card>

        <Card>
          <Field label="Rep range">
            <View className="flex-row flex-wrap items-center gap-x-1 gap-y-2">
              <Stepper
                testID="exercise-form-rep-min"
                accessibilityLabel="Minimum reps"
                value={state.repMin}
                min={1}
                max={state.repMax}
                onChange={(repMin) => setState((s) => ({ ...s, repMin }))}
              />
              <Text className="text-subhead text-label-secondary">to</Text>
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
          </Field>

          <Field label="Rest">
            <Stepper
              testID="exercise-form-rest"
              accessibilityLabel="Rest seconds"
              value={state.restSec}
              step={15}
              min={15}
              max={900}
              format={(v) => `${v} s`}
              onChange={(restSec) => setState((s) => ({ ...s, restSec }))}
            />
            <FieldError testID="exercise-form-error-rest" message={errors.fields.rest} />
          </Field>
        </Card>

        <Card>
          <View className="flex-row items-center justify-between gap-2">
            <FieldLabel>Cues (optional, up to {MAX_CUES})</FieldLabel>
            {state.cues.length < MAX_CUES ? (
              // MO-01: press scale on the tinted text button.
              <PressableScale
                testID="exercise-form-add-cue"
                accessibilityRole="button"
                accessibilityLabel="Add cue"
                onPress={addCue}
                className="min-h-11 flex-row items-center gap-1 px-2"
              >
                <Icon name="add" size={20} color={colors.brand} />
                <Text className="text-callout font-semibold text-brand">Cue</Text>
              </PressableScale>
            ) : null}
          </View>
          {state.cues.map((cue, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <View className="min-w-0 flex-1">
                <Input
                  testID={`exercise-form-cue-${i}`}
                  value={cue}
                  onChangeText={(text) => setCue(i, text)}
                  placeholder={`Cue ${i + 1}`}
                  accessibilityLabel={`Cue ${i + 1}`}
                  maxLength={EXERCISE_CUE_MAX}
                  {...cuesChain.bind(i, { onFocus: scrollFieldIntoView })}
                />
              </View>
              <IconButton
                testID={`exercise-form-remove-cue-${i}`}
                accessibilityLabel={`Remove cue ${i + 1}`}
                icon={<Icon name="close" size={20} color={colors.brand} />}
                onPress={() => removeCue(i)}
              />
            </View>
          ))}
          <FieldError testID="exercise-form-error-cues" message={errors.fields.cues} />
        </Card>

        {errors.form ? (
          <View testID="exercise-form-errors">
            <Text accessibilityRole="alert" className="text-subhead text-danger">
              {errors.form}
            </Text>
          </View>
        ) : null}

        {!online ? (
          <View
            testID="exercise-form-offline"
            className="rounded-control border border-separator bg-surface-sunken px-3 py-2"
          >
            <Text className="text-subhead text-label">
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

function Card({ children }: { children: ReactNode }) {
  return (
    <View className="gap-4 rounded-card border border-separator bg-surface p-4">{children}</View>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="min-w-0 shrink text-subhead font-semibold text-label-secondary">
      {children}
    </Text>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </View>
  );
}

/** A plain-language error under the field it belongs to (read out as it appears). */
function FieldError({ testID, message }: { testID: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <Text
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="text-subhead text-danger"
    >
      {message}
    </Text>
  );
}
