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

const CUISINE_EMOJI: Array<[RegExp, string]> = [
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
  generating,
  className,
}: {
  recipeName: string;
  cuisineType?: string | undefined;
  generating: boolean;
  className?: string | undefined;
}) {
  const { emoji, gradient } = placeholderStyle(recipeName, cuisineType);
  return (
    <div
      className={cn('relative overflow-hidden bg-gradient-to-br', gradient, className)}
      role="img"
      aria-label={generating ? `Preparing photo for ${recipeName}` : recipeName}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className={cn('text-3xl', generating && 'animate-pulse')} aria-hidden="true">
          {emoji}
        </span>
        {generating && (
          <span className="rounded-full bg-white/60 px-2 py-0.5 text-[9px] font-medium text-gray-600">
            Preparing photo…
          </span>
        )}
      </div>
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
        generating
        className={className}
      />
    );
  }

  if (imageStatus === 'FAILED' || !imageUrl || imgError) {
    // Same placeholder without the "preparing" hint — looks intentional, not broken.
    return (
      <Placeholder
        recipeName={recipeName}
        cuisineType={cuisineType}
        generating={false}
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
          generating
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
