'use client';

import { useParams } from 'next/navigation';
import { AdminOnly } from '@/features/admin-recipes/components/AdminOnly';
import { DraftReview } from '@/features/admin-recipes/components/DraftReview';

// Review one curated draft (market review F1). adminProcedure-gated server-side.
export default function AdminRecipeDraftPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AdminOnly what="This page feeds recipes into the free pool.">
      <DraftReview id={id} />
    </AdminOnly>
  );
}
