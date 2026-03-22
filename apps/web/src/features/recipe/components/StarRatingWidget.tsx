'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Star } from 'lucide-react';

interface StarRatingWidgetProps {
  recipeId: string;
  initialRating?: number | null | undefined;
  initialNotes?: string | null | undefined;
}

export function StarRatingWidget({ recipeId, initialRating, initialNotes }: StarRatingWidgetProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number>(initialRating ?? 0);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saved, setSaved] = useState(!!initialRating);

  const utils = trpc.useUtils();
  const rateMutation = trpc.recipe.rate.useMutation({
    onSuccess: (data) => {
      setSelected(data.rating);
      setNotes(data.notes ?? '');
      setSaved(true);
      void utils.recipe.getMyRating.invalidate({ recipeId });
    },
  });

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
            className="transition-transform hover:scale-110"
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
          onClick={() => rateMutation.mutate({ recipeId, rating: selected, notes })}
          disabled={selected === 0 || rateMutation.isPending || saved}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
        >
          {rateMutation.isPending ? 'Saving…' : saved ? '✓ Saved' : 'Save Rating'}
        </button>
        {rateMutation.isError && (
          <span className="text-xs text-red-600">{rateMutation.error.message}</span>
        )}
      </div>
    </div>
  );
}
