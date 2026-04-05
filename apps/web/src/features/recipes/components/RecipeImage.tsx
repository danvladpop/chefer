'use client';

import { useState } from 'react';
import { cn } from '@chefer/utils';

export type ImageStatusType = 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';

interface RecipeImageProps {
  imageUrl: string | null;
  imageStatus: ImageStatusType;
  recipeName: string;
  className?: string | undefined;
}

function Shimmer({
  className,
  label = 'Preparing image…',
}: {
  className?: string | undefined;
  label?: string | undefined;
}) {
  return (
    <div
      className={cn('relative overflow-hidden bg-muted', className)}
      aria-label={label}
      role="img"
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <span className="text-3xl" aria-hidden="true">
          🍽️
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
    </div>
  );
}

export function RecipeImage({ imageUrl, imageStatus, recipeName, className }: RecipeImageProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isPending = imageStatus === 'PENDING' || imageStatus === 'GENERATING';

  if (isPending) {
    return <Shimmer className={className} label="Preparing image…" />;
  }

  if (imageStatus === 'FAILED' || !imageUrl || imgError) {
    return (
      <div
        className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}
        role="img"
        aria-label={recipeName}
      >
        <span className="text-4xl" aria-hidden="true">
          🍽️
        </span>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      {!imgLoaded && <Shimmer className="absolute inset-0" label="Loading image…" />}
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
