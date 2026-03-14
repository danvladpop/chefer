import { cn } from '@chefer/utils';

interface StatsCardProps {
  title: string;
  value: string;
  change: number;
  description: string;
  icon: string;
}

export function StatsCard({ title, value, change, description, icon }: StatsCardProps) {
  const isPositive = change > 0;
  const isNeutral = change === 0;

  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <span className="text-2xl" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {!isNeutral && (
          <div
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              isPositive
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            )}
            aria-label={`${isPositive ? 'Up' : 'Down'} ${Math.abs(change)}% from last month`}
          >
            <span aria-hidden="true">{isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
