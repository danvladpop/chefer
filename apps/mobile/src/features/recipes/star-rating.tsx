import { useEffect, useRef, useState } from 'react';
import { Pressable, View, type TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, Input, Text, useScrollFieldIntoView } from '@chefer/ui-mobile';
import {
  cn,
  composeNotesWithLikedBy,
  parseLikedBy,
  RATING_LABELS,
  stripLikedBy,
} from '@chefer/utils';
import { useIsPremium } from '../../hooks/use-is-premium';
import { trpc } from '../../lib/trpc';

// Star rating — mobile counterpart of web's StarRatingWidget. Ratings feed
// next week's generation (P1-1); the optional "Who liked it" chips (F2) are
// stored as a structured line inside the notes (shared helpers in
// @chefer/utils). Loads the user's existing rating itself, so it works both
// on recipe detail and at the cook-mode finish. Each star is a 44pt target.

const STARS = [1, 2, 3, 4, 5] as const;

export interface StarRatingProps {
  recipeId: string;
  title?: string;
  /** Extra line under the title (cook mode: why rating matters). */
  hint?: string;
  className?: string;
}

export function StarRating({
  recipeId,
  title = 'Rate this recipe',
  hint,
  className,
}: StarRatingProps) {
  const isPremium = useIsPremium();
  const notesRef = useRef<TextInput>(null);
  const scrollFieldIntoView = useScrollFieldIntoView();
  const { data: existing, isSuccess } = trpc.recipe.getMyRating.useQuery({ recipeId });
  const { data: members = [] } = trpc.household.list.useQuery(undefined, { staleTime: 60_000 });

  const [selected, setSelected] = useState(0);
  const [notes, setNotes] = useState('');
  const [likedBy, setLikedBy] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Only a rating saved THIS session is a nudge moment.
  const [justRated, setJustRated] = useState(false);

  // Seed from the stored rating once it arrives — never over the user's edits.
  useEffect(() => {
    if (hydrated || !isSuccess) {
      return;
    }
    if (existing) {
      setSelected(existing.rating);
      setNotes(stripLikedBy(existing.notes));
      setLikedBy(parseLikedBy(existing.notes));
      setSaved(true);
    }
    setHydrated(true);
  }, [existing, hydrated, isSuccess]);

  const utils = trpc.useUtils();
  const rateMutation = trpc.recipe.rate.useMutation({
    onSuccess: (data) => {
      setSelected(data.rating);
      setNotes(stripLikedBy(data.notes));
      setLikedBy(parseLikedBy(data.notes));
      setSaved(true);
      setJustRated(true);
      void utils.recipe.getMyRating.invalidate({ recipeId });
    },
  });

  const pick = (star: number) => {
    setSelected(star);
    setSaved(false);
    setHydrated(true);
  };

  const toggleLikedBy = (name: string) => {
    setLikedBy((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
    setSaved(false);
    setHydrated(true);
  };

  return (
    <Card testID="star-rating" className={cn('gap-3', className)}>
      <View className="gap-0.5">
        <Text variant="heading">{title}</Text>
        {hint ? (
          <Text variant="muted" className="text-xs">
            {hint}
          </Text>
        ) : null}
      </View>

      {/* Star row — each star pads its hit area to 44pt */}
      <View className="flex-row items-center" accessibilityRole="radiogroup">
        {STARS.map((star) => {
          const filled = star <= selected;
          return (
            <Pressable
              key={star}
              testID={`star-rating-${star}`}
              accessibilityRole="radio"
              accessibilityLabel={`Rate ${star} star${star === 1 ? '' : 's'}`}
              accessibilityState={{ selected: selected === star }}
              onPress={() => pick(star)}
              hitSlop={2}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons
                name={filled ? 'star' : 'star-outline'}
                size={28}
                color={filled ? '#fbbf24' : '#d1d5db'}
              />
            </Pressable>
          );
        })}
        {selected > 0 && (
          <Text testID="star-rating-label" className="ml-2 text-sm text-gray-500">
            {RATING_LABELS[selected]}
          </Text>
        )}
      </View>

      {/* Who liked it (F2) — optional member chips, stored in the notes */}
      {members.length > 0 && (
        <View className="gap-1.5">
          <Text className="text-xs font-medium text-gray-500">Who liked it?</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {['Me', ...members.map((m) => m.name)].map((name) => (
              <Chip
                key={name}
                testID={`star-rating-liked-${name}`}
                label={name}
                selected={likedBy.includes(name)}
                onPress={() => toggleLikedBy(name)}
              />
            ))}
          </View>
        </View>
      )}

      <Input
        ref={notesRef}
        onFocus={() => scrollFieldIntoView(notesRef.current)}
        testID="star-rating-notes"
        accessibilityLabel="Rating notes"
        value={notes}
        onChangeText={(text) => {
          setNotes(text);
          setSaved(false);
          setHydrated(true);
        }}
        placeholder="Any notes? (optional)"
        multiline
        maxLength={400}
        className="h-auto min-h-16 py-2"
        textAlignVertical="top"
      />

      <Button
        testID="star-rating-save"
        disabled={selected === 0 || saved}
        loading={rateMutation.isPending}
        onPress={() =>
          rateMutation.mutate({
            recipeId,
            rating: selected,
            notes: composeNotesWithLikedBy(notes, likedBy),
          })
        }
      >
        {saved ? '✓ Saved' : 'Save rating'}
      </Button>
      {rateMutation.isError && (
        <Text testID="star-rating-error" className="text-xs text-red-600">
          {rateMutation.error.message}
        </Text>
      )}

      {/* The P1-1 pitch at the exact moment they generated the signal */}
      {justRated && isPremium === false && (
        <Text testID="star-rating-nudge" className="text-xs text-primary">
          Premium turns your ratings into next week&apos;s menu — upgrade from your Profile.
        </Text>
      )}
    </Card>
  );
}
