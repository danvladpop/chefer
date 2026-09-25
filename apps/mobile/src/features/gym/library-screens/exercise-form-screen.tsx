import { useMemo, useRef, useState } from 'react';
import { Keyboard, View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import {
  customExerciseInputSchema,
  ExerciseCategory,
  ExerciseLoadType,
  MUSCLE_LABELS,
  MUSCLES,
  type CustomExerciseInput,
  type Muscle,
} from '@chefer/types';
import {
  Button,
  ChipGroup,
  EmptyState,
  Input,
  KeyboardAwareScrollView,
  Screen,
  Stepper,
  Text,
  useFieldChain,
  useScrollFieldIntoView,
} from '@chefer/ui-mobile';
import { trpc } from '../../../lib/trpc';
import { useGymBootstrap } from '../use-gym-bootstrap';
import { EQUIPMENT_FILTERS } from './exercise-filters';
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
  isTimed: boolean;
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
  isTimed: false,
  cues: [],
};

export function ExerciseFormScreen({ exerciseId }: { exerciseId?: string }) {
  const isEdit = exerciseId !== undefined;
  const { data: bootstrap } = useGymBootstrap();
  const utils = trpc.useUtils();

  const existing = isEdit ? bootstrap?.library.find((e) => e.id === exerciseId) : undefined;

  const [state, setState] = useState<FormState>(() =>
    existing
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
          isTimed: existing.isTimed,
          cues: existing.cues,
        }
      : DEFAULT_STATE,
  );
  const [errors, setErrors] = useState<string[]>([]);

  const createMutation = trpc.gym.library.createCustom.useMutation({
    onSuccess: (created) => {
      void utils.gym.bootstrap.invalidate();
      router.replace(`/gym/exercise/${created.id}`);
    },
    onError: (err) => setErrors([err.message]),
  });
  const updateMutation = trpc.gym.library.updateCustom.useMutation({
    onSuccess: () => {
      void utils.gym.bootstrap.invalidate();
      router.back();
    },
    onError: (err) => setErrors([err.message]),
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
      isTimed: state.isTimed,
      cues: state.cues.map((c) => c.trim()).filter((c) => c.length > 0),
    };
    const result = customExerciseInputSchema.safeParse(input);
    if (!result.success) {
      setErrors(result.error.issues.map((i) => i.message));
      return;
    }
    setErrors([]);
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
            onChangeText={(name) => setState((s) => ({ ...s, name }))}
            onFocus={() => scrollFieldIntoView(nameRef.current)}
            placeholder="e.g. Cable pull-through"
            returnKeyType="done"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
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
            onChange={(primaryMuscles) =>
              setState((s) => ({
                ...s,
                primaryMuscles,
                secondaryMuscles: s.secondaryMuscles.filter((m) => !primaryMuscles.includes(m)),
              }))
            }
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
            onChange={(secondaryMuscles) => setState((s) => ({ ...s, secondaryMuscles }))}
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

        <ChipGroup
          testID="exercise-form-timed"
          options={[{ value: 'timed', label: 'Timed exercise (seconds, not reps)' }]}
          value={state.isTimed ? ['timed'] : []}
          allowEmpty
          onChange={(v) => setState((s) => ({ ...s, isTimed: v.length > 0 }))}
        />

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

        {errors.length > 0 ? (
          <View testID="exercise-form-errors">
            {errors.map((message, i) => (
              <Text key={i} className="text-sm text-red-600">
                {message}
              </Text>
            ))}
          </View>
        ) : null}

        <Button testID="exercise-form-submit" loading={isSaving} onPress={onSubmit}>
          {isEdit ? 'Save changes' : 'Create exercise'}
        </Button>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
