'use client';

import { cn } from '@chefer/utils';

export type ImageStatusType = 'PENDING' | 'GENERATING' | 'DONE' | 'FAILED';

interface RecipeImageProps {
  imageUrl: string | null;
  imageStatus: ImageStatusType;
  recipeName: string;
  className?: string;
}

export function RecipeImage({ imageUrl, imageStatus, recipeName, className }: RecipeImageProps) {
  const isPending = imageStatus === 'PENDING' || imageStatus === 'GENERATING';

  if (isPending) {
    return (
      <div
        className={cn('relative overflow-hidden bg-muted', className)}
        aria-label="Image being prepared"
        role="img"
      >
        {/* Shimmer sweep */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <span className="text-3xl" aria-hidden="true">
            🍽️
          </span>
          <span className="text-xs font-medium">Preparing image…</span>
        </div>
      </div>
    );
  }

  if (imageStatus === 'FAILED' || !imageUrl) {
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

  return <img src={imageUrl} alt={recipeName} className={cn('object-cover', className)} />;
}
