'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArchivedRoutines } from '@/features/gym/routine/components/ArchivedRoutines';
import { CreateRoutineSheet } from '@/features/gym/routine/components/CreateRoutineSheet';
import { RoutineListCard } from '@/features/gym/routine/components/RoutineListCard';
import { useSaveGymProfile } from '@/features/gym/settings/use-save-gym-profile';
import { showGymToast } from '@/features/gym/shared/gym-toast';
import { useGymBootstrap } from '@/features/gym/use-gym-bootstrap';
import { useHasMounted } from '@/hooks/useHasMounted';
import { trpc } from '@/lib/trpc';
import { ArrowLeft, Plus } from 'lucide-react';
import { userFacingErrorMessage } from '@chefer/utils';
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

  const { data: bootstrap } = useGymBootstrap({ enabled: hasMounted });
  const profile = bootstrap?.profile ?? null;
  // UX-GYM-14: the weekly goal follows the routine you switch to. A failure shows
  // in the gym toast (the hook is silent so the toast can carry a clear message).
  const saveProfile = useSaveGymProfile();

  const invalidateAll = () => {
    void utils.gym.routine.list.invalidate();
    void utils.gym.bootstrap.invalidate();
  };

  const createFromTemplate = trpc.gym.routine.createFromTemplate.useMutation({
    onSuccess: (created, variables) => {
      invalidateAll();
      setCreateOpen(false);
      if (variables.setActive) {
        const goal = (templates ?? []).find((t) => t.key === variables.templateKey)?.daysPerWeek;
        const current = profile?.weeklyGoal;
        if (goal !== undefined && current !== undefined && goal !== current) {
          saveProfile.mutate(
            { weeklyGoal: goal },
            {
              onError: (error) =>
                showGymToast({ message: userFacingErrorMessage(error), type: 'error' }),
            },
          );
          showGymToast({
            message: `Switched to “${created.name}”. Weekly goal is now ${String(goal)}.`,
          });
        } else {
          showGymToast({ message: `Switched to “${created.name}”.` });
        }
      }
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
  const setActiveMutation = trpc.gym.routine.setActive.useMutation({ onSuccess: invalidateAll });
  // UX-GYM-34: errors surface as a toast (the archived list can be collapsed).
  const restoreMutation = trpc.gym.routine.restore.useMutation({
    meta: { silent: true },
    onSuccess: invalidateAll,
    onError: (err) => showGymToast({ message: userFacingErrorMessage(err), type: 'error' }),
  });
  const archiveMutation = trpc.gym.routine.archive.useMutation({
    onSuccess: (_data, variables) => {
      const archived = routines?.find((r) => r.id === variables.id);
      invalidateAll();
      if (!archived) return;
      // Archiving can be undone for a few seconds, and from "Archived" afterwards.
      // Undoing the ACTIVE routine makes it active again (setActive also un-archives).
      showGymToast({
        message: `Archived “${archived.name}”.`,
        actionLabel: 'Undo',
        onAction: () => {
          if (archived.isActive) setActiveMutation.mutate({ id: archived.id });
          else restoreMutation.mutate({ id: archived.id });
        },
      });
    },
  });

  const busyId =
    duplicateMutation.variables?.id ??
    archiveMutation.variables?.id ??
    setActiveMutation.variables?.id ??
    null;
  const anyMutationPending =
    duplicateMutation.isPending ||
    archiveMutation.isPending ||
    setActiveMutation.isPending ||
    restoreMutation.isPending;
  const liveRoutines = (routines ?? []).filter((r) => !r.archived);
  const archivedRoutines = (routines ?? []).filter((r) => r.archived);

  const hasActive = (routines ?? []).some((r) => r.isActive && !r.archived);

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

      {liveRoutines.length === 0 && (
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
        {liveRoutines.map((routine) => (
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

      <ArchivedRoutines
        rows={archivedRoutines}
        restoringId={restoreMutation.isPending ? (restoreMutation.variables?.id ?? null) : null}
        disabled={anyMutationPending}
        onRestore={(routine) => {
          restoreMutation.mutate(
            { id: routine.id },
            { onSuccess: () => showGymToast({ message: `Restored “${routine.name}”.` }) },
          );
        }}
      />

      <CreateRoutineSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        templates={templates ?? []}
        creating={createFromTemplate.isPending || createBlank.isPending}
        creatingSetActive={createFromTemplate.variables?.setActive}
        hasActive={hasActive}
        currentGoal={profile?.weeklyGoal ?? null}
        equipmentAccess={profile?.equipmentAccess ?? 'FULL_GYM'}
        onCreateFromTemplate={(templateKey, setActive) =>
          createFromTemplate.mutate({ templateKey, setActive })
        }
        onCreateBlank={(name, days) => createBlank.mutate({ name, days })}
      />
    </div>
  );
}
