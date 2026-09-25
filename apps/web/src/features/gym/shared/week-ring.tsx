import { cn } from '@chefer/utils';

/**
 * The weekly-goal ring ("2 of 3 this week"). Weekly, never daily
 * (gym_plan.md §1.4): the ring fills; it never turns red.
 */
export function WeekRing({
  done,
  goal,
  size = 64,
  className,
}: {
  done: number;
  goal: number;
  size?: number;
  className?: string;
}) {
  const stroke = Math.max(4, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, done / goal) : 0;
  const met = goal > 0 && done >= goal;

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${done} of ${goal} workouts this week`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-gray-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn('transition-all', met ? 'stroke-emerald-500' : 'stroke-[#944a00]')}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-800">
        {done}/{goal}
      </span>
    </div>
  );
}
