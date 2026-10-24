'use client';

import { trpc } from '@/lib/trpc';
import { ShieldAlert } from 'lucide-react';

/**
 * Renders `children` (and so mounts their queries) for admins only. UX, not
 * security: every curatedAdmin procedure is adminProcedure-gated server-side.
 */
export function AdminOnly({ what, children }: { what: string; children: React.ReactNode }) {
  const { data: me } = trpc.user.me.useQuery();
  if (!me) return <div className="h-40 animate-pulse rounded-2xl bg-gray-100" aria-hidden="true" />;
  if (me.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-20 text-center">
        <ShieldAlert className="h-10 w-10 text-gray-300" aria-hidden="true" />
        <h1 className="font-medium text-gray-700">Admins only</h1>
        <p className="text-sm text-gray-500">{what}</p>
      </div>
    );
  }
  return <>{children}</>;
}
