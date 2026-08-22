'use client';

import { use } from 'react';
import { CookMode } from '@/features/recipes/components/cook-mode';

// ─── Cook mode route (P1-3) ───────────────────────────────────────────────────
// Entry points: the recipe detail page's "Cook" button and the dashboard's
// next-meal hero. ?meal=<type> tags the tracker entry; without it the meal
// type is guessed from the time of day.

export default function CookModePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CookMode recipeId={id} />;
}
