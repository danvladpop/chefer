'use client';

import { Check } from 'lucide-react';
import { cn } from '@chefer/utils';

// Check-off disc (MO-16): a done disc grows from the centre on the bouncy
// spring (`animate-in zoom-in-50` + `ease-spring-bouncy`, transform/opacity
// only) — it animates when a row flips to done, because the done element mounts
// then. The global reduced-motion rule makes it instant.

export function AnimatedCheck({ done, className }: { done: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-done={done}
      className={cn(
        'relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
        done ? 'border-emerald-600' : 'border-gray-300',
        className,
      )}
    >
      {done && (
        <span className="absolute -inset-0.5 flex animate-in items-center justify-center rounded-full bg-emerald-600 text-white duration-fast ease-spring-bouncy zoom-in-50 fade-in-0">
          <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}
