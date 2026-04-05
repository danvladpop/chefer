'use client';

import { useCallback, useState } from 'react';
import { RecipeImage, type ImageStatusType } from '@/features/recipes/components/RecipeImage';
import { useRecipeImageStream } from '@/hooks/useRecipeImageStream';

interface Props {
  recipeId: string;
  recipeName: string;
  initialImageUrl: string | null;
  initialImageStatus: ImageStatusType;
  className?: string;
}

export function RecipeDetailImage({
  recipeId,
  recipeName,
  initialImageUrl,
  initialImageStatus,
  className,
}: Props) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [imageStatus, setImageStatus] = useState(initialImageStatus);

  const isPending = initialImageStatus === 'PENDING' || initialImageStatus === 'GENERATING';

  const handleUpdate = useCallback(
    (update: { recipeId: string; imageUrl: string | null; status: string }) => {
      setImageUrl(update.imageUrl);
      setImageStatus(update.status as ImageStatusType);
    },
    [],
  );

  // Only subscribe if still pending — avoids an unnecessary SSE connection
  useRecipeImageStream(isPending ? [recipeId] : [], handleUpdate);

  return (
    <RecipeImage
      imageUrl={imageUrl}
      imageStatus={imageStatus}
      recipeName={recipeName}
      className={className}
    />
  );
}
