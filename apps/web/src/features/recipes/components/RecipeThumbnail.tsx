'use client';

import Image from 'next/image';
import { getRecipeImageProps } from '@/lib/recipe-image';
import { cn } from '@chefer/utils';
import {
  RecipeImagePlaceholder,
  type ImageStatusType,
  type RecipeImagePlaceholderLabel,
} from './RecipeImage';

type RecipeThumbnailProps = {
  imageUrl: string | null | undefined;
  recipeName: string;
  /** next/image `sizes` for the `fill` layout. */
  sizes: string;
  /** Applied to the photo and to the placeholder that stands in for it. */
  className?: string | undefined;
  /**
   * The recipe's image lifecycle, when the surface's data carries it. Without
   * it a missing photo shows the neutral emoji-only placeholder.
   */
  imageStatus?: ImageStatusType | undefined;
  cuisineType?: string | undefined;
};

function placeholderLabel(status: ImageStatusType | undefined): RecipeImagePlaceholderLabel {
  if (status === 'PENDING' || status === 'GENERATING') return 'generating';
  if (status === 'FAILED' || status === 'DONE') return 'unavailable';
  return 'none';
}

/**
 * A recipe photo in a `fill` layout — the parent supplies size, position and
 * rounding. With no photo it renders the recipe placeholder in the same box,
 * never a stock image of some other dish.
 */
export function RecipeThumbnail({
  imageUrl,
  recipeName,
  sizes,
  className,
  imageStatus,
  cuisineType,
}: RecipeThumbnailProps) {
  const photo = getRecipeImageProps(imageUrl);
  if (photo === null) {
    return (
      <RecipeImagePlaceholder
        recipeName={recipeName}
        cuisineType={cuisineType}
        label={placeholderLabel(imageStatus)}
        className={cn('absolute inset-0', className)}
      />
    );
  }
  return <Image {...photo} alt={recipeName} fill sizes={sizes} className={className} />;
}
