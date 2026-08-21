'use client';

import { useState } from 'react';
import { cn } from '@chefer/utils';

export type ImageStatusType = 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';

interface RecipeImageProps {
  imageUrl: string | null;
  imageStatus: ImageStatusType;
  recipeName: string;
  cuisineType?: string | undefined;
  className?: string | undefined;
}

// ─── Deterministic placeholder styling ────────────────────────────────────────
// While a photo is being generated (or failed to generate) the card shows a
// cuisine-tinted gradient + food emoji instead of a grey "broken" shimmer.
// Deterministic per recipe so the board looks intentional and stable.

const CUISINE_EMOJI: [RegExp, string][] = [
  [/italian/i, '🍝'],
  [/mexican/i, '🌮'],
  [/japanese|sushi/i, '🍣'],
  [/thai|asian|chinese|stir/i, '🥢'],
  [/indian/i, '🍛'],
  [/mediterranean|greek/i, '🫒'],
  [/middle.?eastern/i, '🧆'],
  [/american/i, '🥪'],
  [/french/i, '🥐'],
  [/paleo|healthy|salad/i, '🥗'],
];

const GRADIENTS = [
  'from-amber-100 to-orange-200',
  'from-emerald-100 to-teal-200',
  'from-rose-100 to-pink-200',
  'from-sky-100 to-indigo-200',
  'from-lime-100 to-emerald-200',
  'from-violet-100 to-purple-200',
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function placeholderStyle(recipeName: string, cuisineType?: string) {
  const emoji = CUISINE_EMOJI.find(([re]) => re.test(cuisineType ?? recipeName))?.[1] ?? '🍽️';
  const gradient = GRADIENTS[hashString(recipeName) % GRADIENTS.length] ?? GRADIENTS[0];
  return { emoji, gradient };
}

function Placeholder({
  recipeName,
  cuisineType,
  label,
  className,
}: {
  recipeName: string;
  cuisineType?: string | undefined;
  /** 'generating' pulses with "Preparing photo…"; 'unavailable' shows a static hint; 'none' is emoji-only. */
  label: 'generating' | 'unavailable' | 'none';
  className?: string | undefined;
}) {
  const { emoji, gradient } = placeholderStyle(recipeName, cuisineType);
  return (
    <div
      className={cn('relative overflow-hidden bg-gradient-to-br', gradient, className)}
      role="img"
      aria-label={label === 'generating' ? `Preparing photo for ${recipeName}` : recipeName}
    >
      {label === 'generating' ? (
        // Food-prep animation conveys "photo being generated" — no text needed
        <div className="absolute inset-0 flex items-center justify-center p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/food-prep.svg"
            alt=""
            aria-hidden="true"
            className="h-full max-h-24 w-auto max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-3xl" aria-hidden="true">
            {emoji}
          </span>
          {label === 'unavailable' && (
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[9px] font-medium text-gray-500">
              Photo unavailable
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function RecipeImage({
  imageUrl,
  imageStatus,
  recipeName,
  cuisineType,
  className,
}: RecipeImageProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isPending = imageStatus === 'PENDING' || imageStatus === 'GENERATING';

  if (isPending) {
    return (
      <Placeholder
        recipeName={recipeName}
        cuisineType={cuisineType}
        label="generating"
        className={className}
      />
    );
  }

  if (imageStatus === 'FAILED' || !imageUrl || imgError) {
    // Distinguishable from "Preparing photo…" so a final failure doesn't read
    // as an eternally-loading card.
    return (
      <Placeholder
        recipeName={recipeName}
        cuisineType={cuisineType}
        label="unavailable"
        className={className}
      />
    );
  }

  return (
    <div className={cn('relative', className)}>
      {!imgLoaded && (
        <Placeholder
          recipeName={recipeName}
          cuisineType={cuisineType}
          label="generating"
          className="absolute inset-0"
        />
      )}
      <img
        src={imageUrl}
        alt={recipeName}
        className={cn('object-cover w-full h-full', !imgLoaded && 'opacity-0')}
        onLoad={() => setImgLoaded(true)}
        onError={() => setImgError(true)}
      />
    </div>
  );
}
