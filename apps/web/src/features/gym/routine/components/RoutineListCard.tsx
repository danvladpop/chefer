'use client';

import Link from 'next/link';
import { Archive, Copy, Pencil, Star } from 'lucide-react';
import type { RoutineListItemDto } from '@chefer/types';
import { Badge, Button } from '@chefer/ui';

export interface RoutineListCardProps {
  routine: RoutineListItemDto;
  onSetActive: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  busy?: boolean;
}

export function RoutineListCard({
  routine,
  onSetActive,
  onDuplicate,
  onArchive,
  busy = false,
}: RoutineListCardProps) {
  const handleArchive = () => {
    if (
      window.confirm(`Archive "${routine.name}"? You can still see it, but it won't show up here.`)
    ) {
      onArchive();
    }
  };

  return (
    <div
      data-testid={`routine-card-${routine.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-serif text-base font-semibold text-gray-900">
            {routine.name}
          </h3>
          {routine.isActive && <Badge variant="success">Active</Badge>}
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          {routine.dayCount} day{routine.dayCount === 1 ? '' : 's'} · updated{' '}
          {new Date(routine.updatedAt).toLocaleDateString()}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="min-h-11">
          <Link href={`/gym/routine/edit?id=${routine.id}`}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Link>
        </Button>
        {!routine.isActive && (
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={onSetActive}
            disabled={busy}
          >
            <Star className="h-3.5 w-3.5" /> Set active
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onDuplicate}
          disabled={busy}
        >
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={handleArchive}
          disabled={busy}
        >
          <Archive className="h-3.5 w-3.5" /> Archive
        </Button>
      </div>
    </div>
  );
}
