import { cn } from '@chefer/utils';

/** The app's card surface (matches /tracker and the dashboard). */
export function GymCard({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { children: React.ReactNode }) {
  return (
    <section
      className={cn('rounded-2xl border bg-white p-4 shadow-sm sm:p-5', className)}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Small uppercase eyebrow label used on every card. */
export function CardLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={cn('text-xs font-semibold uppercase tracking-wider text-gray-500', className)}>
      {children}
    </p>
  );
}

/** Loading placeholder blocks. */
export function GymSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
      ))}
    </div>
  );
}
