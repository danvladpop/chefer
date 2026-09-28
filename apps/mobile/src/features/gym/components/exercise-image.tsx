import { useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ExerciseEquipment } from '@chefer/types';
import { useReducedMotion } from '@chefer/ui-mobile';

// UX-05 amendment A6 (T-05.11, O-26, ⚖ D-22 a): one shared exercise-image
// surface. 3:2 everywhere (never a square crop), a designed placeholder
// instead of a letter tile or a blank square for the 8 photo-less exercises,
// customs, requested exercises and any photo the audit hides, and one silent
// retry + `exercise_image_failed` on a load error. MO-13 fade in while
// loading; reduced motion shows the photo at once.

const EQUIPMENT_ICON: Record<ExerciseEquipment, keyof typeof Ionicons.glyphMap> = {
  BARBELL: 'barbell-outline',
  SMITH: 'barbell-outline',
  EZ_BAR: 'barbell-outline',
  DUMBBELL: 'barbell-outline',
  KETTLEBELL: 'barbell-outline',
  CABLE: 'fitness-outline',
  MACHINE: 'fitness-outline',
  BAND: 'fitness-outline',
  ASSISTED: 'fitness-outline',
  BODYWEIGHT: 'body-outline',
  // S19 (T-42.0, UX-42 Flow (1)): "an icon per equipment (bicycle-outline,
  // walk-outline, boat-outline for the rower, water-outline for the pool,
  // fitness-outline otherwise)".
  BIKE: 'bicycle-outline',
  ASSAULT_BIKE: 'bicycle-outline',
  TREADMILL: 'walk-outline',
  OUTDOOR: 'walk-outline',
  ROWER: 'boat-outline',
  POOL: 'water-outline',
  ELLIPTICAL: 'fitness-outline',
  STAIR_CLIMBER: 'fitness-outline',
  SKI_ERG: 'fitness-outline',
  JUMP_ROPE: 'fitness-outline',
};

const FADE_MS = 150;

export interface ExerciseImageProps {
  /** Resolved photo URL (already run through exerciseImageUrl), or null. */
  uri: string | null;
  equipment: ExerciseEquipment;
  /** Primary muscle label, shown under the placeholder icon on the hero only (e.g. "Glutes"). */
  primaryMuscleLabel?: string | null;
  name: string;
  /** `thumb` = 60×40 pt row image; `hero` = full-width detail image. */
  size: 'thumb' | 'hero';
  /** True when the audit (README.md) hid this photo for showing the wrong exercise. */
  hidden?: boolean;
  /** Analytics id: a catalogue slug, or 'custom' for a user-authored exercise. */
  analyticsExerciseId: string;
  onImageFailed?: (exerciseId: string) => void;
  testID?: string;
}

export function Placeholder({
  equipment,
  primaryMuscleLabel,
  size,
  testID,
}: {
  equipment: ExerciseEquipment;
  primaryMuscleLabel?: string | null;
  size: 'thumb' | 'hero';
  testID?: string;
}) {
  const iconSize = size === 'hero' ? 40 : 18;
  return (
    <View
      testID={testID}
      accessible={size === 'hero'}
      accessibilityLabel={size === 'hero' ? 'No photo yet' : undefined}
      className="h-full w-full items-center justify-center bg-accent"
    >
      <Ionicons name={EQUIPMENT_ICON[equipment]} size={iconSize} color="rgba(0,0,0,0.6)" />
      {size === 'hero' && primaryMuscleLabel ? (
        <Text className="mt-1 text-xs text-muted-foreground">{primaryMuscleLabel}</Text>
      ) : null}
    </View>
  );
}

export function ExerciseImage({
  uri,
  equipment,
  primaryMuscleLabel = null,
  name,
  size,
  hidden = false,
  analyticsExerciseId,
  onImageFailed,
  testID = 'exercise-image',
}: ExerciseImageProps) {
  const reducedMotion = useReducedMotion();
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  // A new uri (e.g. navigating to a different exercise) resets retry/failure state.
  useEffect(() => {
    setRetried(false);
    setFailed(false);
    opacity.setValue(reducedMotion ? 1 : 0);
  }, [uri, reducedMotion, opacity]);

  const showPlaceholder = hidden || !uri || failed;
  const dimensions =
    size === 'hero' ? { width: '100%' as const, aspectRatio: 1.5 } : { width: 60, height: 40 };

  return (
    <View testID={testID} className="overflow-hidden rounded-lg" style={dimensions}>
      {showPlaceholder ? (
        <Placeholder
          equipment={equipment}
          primaryMuscleLabel={primaryMuscleLabel}
          size={size}
          testID={`${testID}-placeholder`}
        />
      ) : (
        <>
          <View className="absolute inset-0 bg-muted" />
          <Animated.View style={{ flex: 1, opacity }}>
            <Image
              // Keying on `retried` forces a fresh mount (and load attempt)
              // for the retry — the uri itself does not change.
              key={retried ? 'retry' : 'initial'}
              testID={`${testID}-photo`}
              source={{ uri }}
              style={{ flex: 1 }}
              contentFit="cover"
              cachePolicy="disk"
              accessible={size === 'hero'}
              accessibilityLabel={size === 'hero' ? `${name}, start and end positions` : undefined}
              accessibilityElementsHidden={size !== 'hero'}
              onLoad={() => {
                if (!reducedMotion) {
                  Animated.timing(opacity, {
                    toValue: 1,
                    duration: FADE_MS,
                    useNativeDriver: true,
                  }).start();
                } else {
                  opacity.setValue(1);
                }
              }}
              onError={() => {
                if (!retried) {
                  // One silent retry on the next mount (a transient network blip).
                  setRetried(true);
                  return;
                }
                setFailed(true);
                onImageFailed?.(analyticsExerciseId);
              }}
            />
          </Animated.View>
        </>
      )}
    </View>
  );
}
