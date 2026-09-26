import * as React from 'react';
import { cn } from '../lib/utils';

// ─── Switch ───────────────────────────────────────────────────────────────────
// An on/off preference toggle (role="switch"). The visible track stays small
// (44×24) but the button itself is a 44×44 hit area (CLAUDE.md touch-target
// rule). Label it with aria-labelledby (a heading next to it) or aria-label.

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'role' | 'type'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-[#944a00]' : 'bg-gray-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  ),
);
Switch.displayName = 'Switch';
