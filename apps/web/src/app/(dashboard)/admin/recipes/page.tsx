'use client';

import { AdminOnly } from '@/features/admin-recipes/components/AdminOnly';
import { IngestQueue } from '@/features/admin-recipes/components/IngestQueue';

// Curated recipe ingest queue (market review F1). adminProcedure-gated server-side.
export default function AdminRecipesPage() {
  return (
    <AdminOnly what="This page feeds recipes into the free pool.">
      <IngestQueue />
    </AdminOnly>
  );
}
