import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import type { ExerciseEquipment } from '@chefer/types';
import { Placeholder } from '../components/exercise-image';

// Start/end photo crossfade (gym_plan.md §1.3 exercise detail, §5.5 media): a
// cheap "animation" that works offline since expo-image caches both photos to
// disk after the first view. Pauses while the screen isn't focused so it
// doesn't keep animating (and re-rendering) behind other screens.
//
// UX-05 amendment A6 (T-05.11): 3:2 everywhere, not the square this hero used
// to crop to (a third of every landscape photo was cut off) — and a designed
// icon placeholder, never a blank tile, for the 8 photo-less exercises,
// customs and any photo the audit hides.

const CROSSFADE_MS = 1200;

export interface PhotoCrossfadeProps {
  /** API-resolved photo URLs, already run through exerciseImageUrl. */
  images: readonly string[];
  equipment: ExerciseEquipment;
  primaryMuscleLabel?: string | null;
  /** True when the audit (apps/api/static/exercises/README.md) hid this exercise's photos. */
  hidden?: boolean;
  testID?: string;
}

export function PhotoCrossfade({
  images,
  equipment,
  primaryMuscleLabel = null,
  hidden = false,
  testID = 'exercise-photo-crossfade',
}: PhotoCrossfadeProps) {
  const isFocused = useIsFocused();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (images.length < 2 || !isFocused) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: CROSSFADE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: CROSSFADE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [images.length, isFocused, opacity]);

  if (hidden || images.length === 0) {
    return (
      <View
        testID={testID}
        className="w-full overflow-hidden rounded-xl"
        style={{ aspectRatio: 1.5 }}
      >
        <Placeholder equipment={equipment} primaryMuscleLabel={primaryMuscleLabel} size="hero" />
      </View>
    );
  }

  return (
    <View
      testID={testID}
      className="w-full overflow-hidden rounded-xl bg-muted"
      style={{ aspectRatio: 1.5 }}
    >
      <Image
        source={{ uri: images[0] }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="disk"
        accessible
        accessibilityLabel="start and end positions"
      />
      {images[1] ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
          <Image
            source={{ uri: images[1] }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="disk"
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
