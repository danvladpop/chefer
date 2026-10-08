'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  Drumstick,
  Leaf,
  Milk,
  ShoppingBasket,
  Snowflake,
  Wheat,
  type LucideIcon,
} from 'lucide-react';

// ─── Shop row / detail thumbnail (FB7-10) ─────────────────────────────────────
// The picture when the ingredient has one that loads; otherwise the aisle's icon
// on a tinted tile — a missing URL or a failed (cold, timed-out) render never
// leaves a blank box. Fills its parent, which sets the size. Mirrors the mobile
// `ItemThumb` / `CATEGORY_TILES`.

const CATEGORY_TILES: Record<string, { Icon: LucideIcon; tile: string }> = {
  produce: { Icon: Leaf, tile: 'bg-emerald-50 text-emerald-700' },
  proteins: { Icon: Drumstick, tile: 'bg-rose-50 text-rose-700' },
  dairy: { Icon: Milk, tile: 'bg-sky-50 text-sky-700' },
  grains: { Icon: Wheat, tile: 'bg-amber-50 text-amber-700' },
  frozen: { Icon: Snowflake, tile: 'bg-cyan-50 text-cyan-700' },
  other: { Icon: ShoppingBasket, tile: 'bg-neutral-100 text-neutral-600' },
};

export function categoryTile(category: string) {
  return CATEGORY_TILES[category] ?? CATEGORY_TILES['other']!;
}

export function ItemThumb({
  src,
  category,
  alt = '',
  sizes,
  iconClassName = 'h-5 w-5',
}: {
  src: string | null | undefined;
  category: string;
  alt?: string;
  sizes: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  // A new picture for the same row gets a fresh try.
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    const { Icon, tile } = categoryTile(category);
    return (
      <div
        data-testid="item-thumb-fallback"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : true}
        className={`flex h-full w-full items-center justify-center ${tile}`}
      >
        <Icon className={iconClassName} aria-hidden="true" />
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
