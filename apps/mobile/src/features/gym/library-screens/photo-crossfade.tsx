import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';

// Start/end photo crossfade (gym_plan.md §1.3 exercise detail, §5.5 media): a
// cheap "animation" that works offline since expo-image caches both photos to
// disk after the first view. Pauses while the screen isn't focused so it
// doesn't keep animating (and re-rendering) behind other screens.

const CROSSFADE_MS = 1200;

export interface PhotoCrossfadeProps {
  /** API-resolved photo URLs, already run through exerciseImageUrl. */
  images: readonly string[];
  testID?: string;
}

export function PhotoCrossfade({
  images,
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

  if (images.length === 0) {
    return (
      <View testID={testID} className="w-full rounded-xl bg-muted" style={{ aspectRatio: 1 }} />
    );
  }

  return (
    <View
      testID={testID}
      className="w-full overflow-hidden rounded-xl bg-muted"
      style={{ aspectRatio: 1 }}
    >
      <Image
        source={{ uri: images[0] }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="disk"
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
