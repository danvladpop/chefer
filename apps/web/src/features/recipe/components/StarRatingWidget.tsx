'use client';

import { useState } from 'react';
import { UpgradeNudge } from '@/features/premium/components/UpgradeNudge';
import { useHousehold } from '@/hooks/useHousehold';
import { useIsPremium } from '@/hooks/useIsPremium';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { Star } from 'lucide-react';
import { composeNotesWithLikedBy, parseLikedBy, stripLikedBy } from '../lib/liked-by';

interface StarRatingWidgetProps {
  recipeId: string;
  initialRating?: number | null | undefined;
  initialNotes?: string | null | undefined;
}

export function StarRatingWidget({ recipeId, initialRating, initialNotes }: StarRatingWidgetProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number>(initialRating ?? 0);
  // F2: the "Liked by" member chips live as a structured line INSIDE the
  // notes column (v1 — no schema); the textarea shows only the free text.
  const [notes, setNotes] = useState(stripLikedBy(initialNotes));
  const [likedBy, setLikedBy] = useState<string[]>(parseLikedBy(initialNotes));
  const [saved, setSaved] = useState(!!initialRating);
  // Only a rating saved THIS session is a nudge moment — not revisiting an
  // already-rated recipe.
  const [justRated, setJustRated] = useState(false);
  const isPremium = useIsPremium();
  const { members } = useHousehold();

  const utils = trpc.useUtils();
  const rateMutation = trpc.recipe.rate.useMutation({
    onSuccess: (data) => {
      capture('recipe_rated', { rating: data.rating });
      setSelected(data.rating);
      setNotes(stripLikedBy(data.notes));
      setLikedBy(parseLikedBy(data.notes));
      setSaved(true);
      setJustRated(true);
      void utils.recipe.getMyRating.invalidate({ recipeId });
    },
  });

  function toggleLikedBy(name: string) {
    setLikedBy((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
    setSaved(false);
  }

  const displayRating = hovered ?? selected;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
      <h3 className="mb-3 font-semibold text-neutral-700">Rate this recipe</h3>

      {/* Star row */}
      <div className="mb-4 flex gap-1" onMouseLeave={() => setHovered(null)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`${star} star`}
            aria-pressed={selected === star}
            onMouseEnter={() => setHovered(star)}
            onClick={() => {
              setSelected(star);
              setSaved(false);
            }}
            className="flex h-11 w-11 items-center justify-center transition-transform hover:scale-110"
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                star <= displayRating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'
              }`}
            />
          </button>
        ))}
        {selected > 0 && (
          <span className="ml-2 self-center text-sm text-neutral-500">
            {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][selected]}
          </span>
        )}
      </div>

      {/* Who liked it (F2) — optional member chips, stored in the notes */}
      {members.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-neutral-500">Who liked it?</p>
          <div className="flex flex-wrap gap-1.5">
            {['Me', ...members.map((m) => m.name)].map((name) => {
              const active = likedBy.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleLikedBy(name)}
                  aria-pressed={active}
                  className={`min-h-11 rounded-full border px-3 py-1 text-sm transition-colors ${
                    active
                      ? 'border-emerald-400 bg-emerald-50 font-medium text-emerald-700'
                      : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        placeholder="Any notes? (optional)"
        rows={2}
        className="mb-3 w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={() =>
            rateMutation.mutate({
              recipeId,
              rating: selected,
              notes: composeNotesWithLikedBy(notes, likedBy),
            })
          }
          disabled={selected === 0 || rateMutation.isPending || saved}
          className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {rateMutation.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save Rating'}
        </button>
        {rateMutation.isError && (
          <span className="text-xs text-red-600">{rateMutation.error.message}</span>
        )}
      </div>

      {/* §6.5: the P1-1 pitch at the exact moment they generated the signal */}
      {justRated && isPremium === false && (
        <UpgradeNudge
          source="post-rating"
          message="Premium turns your ratings into next week's menu."
          className="mt-4"
        />
      )}
    </div>
  );
}
