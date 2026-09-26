'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { useCountUp } from '../motion/use-count-up';

const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-US');

export interface CountUpProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number;
  /** Display formatter (default: rounded, locale-grouped — "2,810"). */
  format?: (value: number) => string;
  durationMs?: number;
}

/**
 * A number that counts up to `value` (MO-06). `tabular-nums` keeps its width
 * steady while it counts. Web twin of @chefer/ui-mobile CountUp.
 */
export function CountUp({
  value,
  format = defaultFormat,
  durationMs,
  className,
  ...props
}: CountUpProps) {
  const shown = useCountUp(value, durationMs);
  return (
    <span className={cn('tabular-nums', className)} {...props}>
      {format(shown)}
    </span>
  );
}
