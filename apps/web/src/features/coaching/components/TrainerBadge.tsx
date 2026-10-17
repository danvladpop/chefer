import { BadgeCheck } from 'lucide-react';
import { COACHING_COPY } from '@chefer/types';
import { cn } from '@chefer/utils';

/** The self-declared "Trainer" badge next to a trainer's name (PRD 2026-10 §4.1). */
export function TrainerBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fff3e8] px-2 py-0.5 text-xs font-semibold text-[#944a00]',
        className,
      )}
      data-testid="trainer-badge"
    >
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {COACHING_COPY.find.badge}
    </span>
  );
}

/** A trainer's name with the badge and the optional "Gym / city" line under it. */
export function TrainerNameBlock({
  name,
  gymLine,
  as: Tag = 'span',
  nameClassName,
}: {
  name: string;
  gymLine: string | null;
  as?: 'span' | 'h1';
  nameClassName?: string;
}) {
  return (
    <span className="block min-w-0">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Tag className={cn('min-w-0 break-words font-semibold text-gray-900', nameClassName)}>
          {name}
        </Tag>
        <TrainerBadge />
      </span>
      {gymLine && (
        <span className="mt-0.5 block min-w-0 break-words text-sm text-gray-600">{gymLine}</span>
      )}
    </span>
  );
}
