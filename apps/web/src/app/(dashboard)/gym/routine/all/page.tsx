'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CreateRoutineSheet } from '@/features/gym/routine/components/CreateRoutineSheet';
import { RoutineListCard } from '@/features/gym/routine/components/RoutineListCard';
import { useHasMounted } from '@/hooks/useHasMounted';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Plus } from 'lucide-react';
import RoutinesLoading from './loading';

export default function AllRoutinesPage() {
  const hasMounted = useHasMounted();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: routines, isLoading } = trpc.gym.routine.list.useQuery(undefined, {
    enabled: hasMounted,
  });
  const { data: templates } = trpc.gym.routine.templates.useQuery(undefined, {
    enabled: hasMounted,
  });

  const invalidateAll = () => {
    void utils.gym.routine.list.invalidate();
    void utils.gym.bootstrap.invalidate();
  };

  const createFromTemplate = trpc.gym.routine.createFromTemplate.useMutation({
    onSuccess: (created) => {
      invalidateAll();
      setCreateOpen(false);
      router.push(`/gym/routine/edit?id=${created.id}`);
    },
  });
  const createBlank = trpc.gym.routine.createBlank.useMutation({
    onSuccess: (created) => {
      invalidateAll();
      setCreateOpen(false);
      router.push(`/gym/routine/edit?id=${created.id}`);
    },
  });
  const duplicateMutation = trpc.gym.routine.duplicate.useMutation({ onSuccess: invalidateAll });
  const archiveMutation = trpc.gym.routine.archive.useMutation({ onSuccess: invalidateAll });
  const setActiveMutation = trpc.gym.routine.setActive.useMutation({ onSuccess: invalidateAll });

  const busyId =
    duplicateMutation.variables?.id ??
    archiveMutation.variables?.id ??
    setActiveMutation.variables?.id ??
    null;
  const anyMutationPending =
    duplicateMutation.isPending || archiveMutation.isPending || setActiveMutation.isPending;

  if (!hasMounted || isLoading) return <RoutinesLoading />;

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/gym/routine"
            aria-label="Back to routine"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:h-9 sm:w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-serif text-xl font-semibold text-gray-900">My routines</h1>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex min-h-11 items-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 sm:min-h-9"
        >
          <Plus className="h-4 w-4" /> New routine
        </button>
      </div>

      {(!routines || routines.length === 0) && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-gray-500">No routines yet.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
          >
            Create your first routine
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {routines?.map((routine) => (
          <RoutineListCard
            key={routine.id}
            routine={routine}
            busy={anyMutationPending && busyId === routine.id}
            onSetActive={() => setActiveMutation.mutate({ id: routine.id })}
            onDuplicate={() => duplicateMutation.mutate({ id: routine.id })}
            onArchive={() => archiveMutation.mutate({ id: routine.id })}
          />
        ))}
      </div>

      <CreateRoutineSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        templates={templates ?? []}
        creating={createFromTemplate.isPending || createBlank.isPending}
        onCreateFromTemplate={(templateKey) =>
          createFromTemplate.mutate({ templateKey, setActive: false })
        }
        onCreateBlank={(name, days) => createBlank.mutate({ name, days })}
      />
    </div>
  );
}
