import { TRAINER_MODE_COPY } from '@chefer/types';
import { cn } from '@chefer/utils';

/**
 * Trainer mode's in-app count badge (trainer-mode.md §7.1). The number is for
 * sight; screen readers hear "N things waiting" as part of the item's name.
 * `announce={false}` leaves the spoken part to a `NavCountText` placed after
 * the label (the tab bar draws the badge on the icon, before the label).
 */
export function NavCountBadge({
  count,
  className,
  announce = true,
}: {
  count: number;
  className?: string;
  announce?: boolean;
}) {
  if (count <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        data-testid="nav-count-badge"
        className={cn(
          'flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#944a00] px-1 text-xs font-semibold leading-none text-white',
          className,
        )}
      >
        {count > 99 ? '99+' : count}
      </span>
      {announce && <NavCountText count={count} />}
    </>
  );
}

/** The spoken half of a count badge. */
export function NavCountText({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="sr-only">, {TRAINER_MODE_COPY.mode.waiting(count)}</span>;
}

/**
 * MO-09 (reduced: crossfade): a mode switch swaps the nav, keyed by mode, so
 * the new items fade in. Only once trainer mode exists for the user, so the
 * Food | Gym shell stays exactly as it was with the flag off. Reduced motion
 * is covered by the global rule in globals.css.
 */
export function modeSwapFade(trainerModeAvailable: boolean): string | undefined {
  return trainerModeAvailable ? 'duration-fast ease-standard animate-in fade-in-0' : undefined;
}
