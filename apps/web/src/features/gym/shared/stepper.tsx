'use client';

import { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@chefer/utils';

/**
 * `[− value +]` with 44 px targets. Holding a button repeats (like the
 * phone's long-press). The value itself can be a button (e.g. opening the
 * plate calculator) via `onValueClick`.
 */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
  onValueClick,
  rawValue,
  onValueChange,
  label,
  valueLabel,
  disabled = false,
  canDecrement = true,
  canIncrement = true,
  className,
  testId,
}: {
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
  onValueClick?: () => void;
  /**
   * T-05.4 (CI-31, AC6): makes the value directly typeable instead of a
   * read-only span/button — reaching 150 from 40 takes a few keystrokes
   * instead of ~44 ± presses. Mutually exclusive with `onValueClick`
   * (typed entry wins when both are given). `rawValue` is the number the
   * input edits; `value`/`valueLabel` still drive the accessible label.
   */
  rawValue?: number;
  onValueChange?: (value: number) => void;
  /** e.g. "weight" — used in the buttons' accessible names. */
  label: string;
  /** Accessible name for the value button. */
  valueLabel?: string;
  disabled?: boolean;
  canDecrement?: boolean;
  canIncrement?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center rounded-xl border bg-white',
        disabled && 'opacity-60',
        className,
      )}
      data-testid={testId}
    >
      <RepeatButton
        onStep={onDecrement}
        disabled={disabled || !canDecrement}
        ariaLabel={`Decrease ${label}`}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </RepeatButton>
      {onValueChange ? (
        <input
          type="number"
          inputMode="decimal"
          value={rawValue ?? ''}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onValueChange(n);
          }}
          aria-label={valueLabel ?? label}
          data-testid={testId ? `${testId}-input` : undefined}
          className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-center text-sm font-semibold tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#944a00]/30 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      ) : onValueClick ? (
        <button
          type="button"
          onClick={onValueClick}
          disabled={disabled}
          aria-label={valueLabel}
          className="min-h-11 min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold tabular-nums text-gray-900 underline decoration-dotted decoration-gray-300 underline-offset-4 hover:bg-gray-50"
        >
          {value}
        </button>
      ) : (
        <span
          className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold tabular-nums text-gray-900"
          aria-label={valueLabel}
        >
          {value}
        </span>
      )}
      <RepeatButton
        onStep={onIncrement}
        disabled={disabled || !canIncrement}
        ariaLabel={`Increase ${label}`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </RepeatButton>
    </div>
  );
}

const REPEAT_DELAY_MS = 450;
const REPEAT_EVERY_MS = 110;

function RepeatButton({
  onStep,
  disabled,
  ariaLabel,
  children,
}: {
  onStep: () => void;
  disabled: boolean;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const timers = useRef<{
    delay?: ReturnType<typeof setTimeout>;
    every?: ReturnType<typeof setInterval>;
  }>({});
  const repeated = useRef(false);
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  }, [onStep]);

  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.every);
    timers.current = {};
  };
  useEffect(() => stop, []);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        repeated.current = false;
        stop();
        timers.current.delay = setTimeout(() => {
          repeated.current = true;
          stepRef.current();
          timers.current.every = setInterval(() => stepRef.current(), REPEAT_EVERY_MS);
        }, REPEAT_DELAY_MS);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        // A hold already stepped; the click that ends it must not add one more.
        if (repeated.current) {
          repeated.current = false;
          return;
        }
        onStep();
      }}
      className="flex h-11 w-11 shrink-0 touch-manipulation select-none items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
