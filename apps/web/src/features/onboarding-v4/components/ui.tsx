'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Dumbbell,
  Leaf,
  PieChart,
  Scale,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { Biscuit, pressCard, pressControl } from '@chefer/ui';
import { cn, ONBOARDING_V4_COPY, type BiscuitLoop, type OnboardingV4Icon } from '@chefer/utils';

// ─── Onboarding V4 building blocks (web) ───────────────────────────────────────
// The revamp roles (canvas / surface / separator / label / brand / brand-tint /
// positive) come from @chefer/tokens via the `revamp-*` Tailwind colours. Press
// feedback is MO-01 (`pressControl` / `pressCard`); nothing animates width.

const ICONS: Record<OnboardingV4Icon, ComponentType<{ className?: string | undefined }>> = {
  calendar: CalendarDays,
  barbell: Dumbbell,
  pie: PieChart,
  people: Users,
  scale: Scale,
  leaf: Leaf,
  restaurant: UtensilsCrossed,
};

export function V4Icon({
  icon,
  className,
}: {
  icon: OnboardingV4Icon;
  className?: string | undefined;
}) {
  const Icon = ICONS[icon];
  return <Icon className={className} aria-hidden="true" />;
}

/** Biscuit on the brand-tint halo, as on every V4 board. */
export function BiscuitHalo({ loop, size }: { loop: BiscuitLoop; size: number }) {
  return (
    <div
      className="relative shrink-0 self-center"
      style={{ width: size, height: size }}
      data-testid="onb-v4-biscuit"
      data-loop={loop}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-[8%] bottom-[2%] h-[62%] rounded-full bg-revamp-brand-tint"
      />
      <div className="relative">
        <Biscuit loop={loop} size={size} />
      </div>
    </div>
  );
}

/** Segmented progress — the question steps only; no "Step x of y" text. */
export function V4TopBar({
  progress,
  onBack,
  backDisabled,
}: {
  progress: { current: number; total: number } | null;
  onBack: () => void;
  backDisabled?: boolean;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5">
      <button
        type="button"
        onClick={onBack}
        disabled={backDisabled}
        aria-label={ONBOARDING_V4_COPY.back}
        className={cn(
          '-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-revamp-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
          pressControl,
        )}
      >
        <ChevronLeft className="h-6 w-6" aria-hidden="true" />
      </button>
      {progress && (
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.current}
          className="flex flex-1 gap-1.5"
        >
          {Array.from({ length: progress.total }, (_, i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i < progress.current ? 'bg-revamp-brand' : 'bg-revamp-separator',
              )}
            />
          ))}
        </div>
      )}
      <span className="w-9 shrink-0" aria-hidden="true" />
    </div>
  );
}

export function V4Heading({ title, lede }: { title: string; lede?: string }) {
  return (
    <div className="flex flex-col gap-1.5 text-center">
      <h1 className="text-[1.75rem] font-bold leading-tight text-revamp-label">{title}</h1>
      {lede && <p className="text-base text-revamp-label-secondary">{lede}</p>}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
  busy,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  busy?: boolean;
  testId?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled === true || busy === true}
      aria-busy={busy === true ? true : undefined}
      data-testid={testId}
      className={cn(
        'flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-revamp-brand px-4 text-[1.0625rem] font-semibold text-revamp-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        pressControl,
      )}
    >
      {children}
    </button>
  );
}

export function TextButton({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        'flex min-h-11 w-full items-center justify-center rounded-control text-base font-semibold text-revamp-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        pressControl,
      )}
    >
      {children}
    </button>
  );
}

/** A 2×2 tile (jobs, goal): icon + label, a tick when selected. */
export function ChoiceTile({
  icon,
  label,
  selected,
  onClick,
  testId,
}: {
  icon: OnboardingV4Icon;
  label: string;
  selected: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'relative flex min-h-[6.5rem] min-w-0 flex-col items-start justify-between gap-2.5 rounded-card p-3.5 text-left text-revamp-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected
          ? 'border-2 border-revamp-brand bg-revamp-brand-tint'
          : 'border border-revamp-separator bg-revamp-surface',
        pressCard,
      )}
    >
      {selected && (
        <span
          aria-hidden="true"
          className="absolute right-2 top-2 flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full bg-revamp-brand text-revamp-on-brand"
        >
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-control',
          selected
            ? 'bg-revamp-brand text-revamp-on-brand'
            : 'bg-revamp-brand-tint text-revamp-brand',
        )}
      >
        <V4Icon icon={icon} className="h-6 w-6" />
      </span>
      <span className="text-[1.0625rem] font-semibold leading-snug">{label}</span>
    </button>
  );
}

/** A pill toggle (safety, experience, equipment). */
export function Chip({
  label,
  selected,
  onClick,
  testId,
  ariaLabel,
  className,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  testId?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'min-h-11 rounded-full border px-4 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected
          ? 'border-revamp-brand bg-revamp-brand text-revamp-on-brand'
          : 'border-revamp-separator bg-revamp-surface text-revamp-label',
        pressControl,
        className,
      )}
    >
      {label}
    </button>
  );
}

/** Green-ticked line (Building checklist, Premium is on). */
export function TickLine({ children, done = true }: { children: ReactNode; done?: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2.5 text-[1.0625rem]',
        done ? 'text-revamp-label' : 'text-revamp-label-secondary',
      )}
    >
      {done ? (
        <span className="flex h-[1.625rem] w-[1.625rem] shrink-0 items-center justify-center rounded-full bg-revamp-positive text-white">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="h-[1.625rem] w-[1.625rem] shrink-0 animate-spin rounded-full border-[3px] border-revamp-separator border-t-revamp-brand"
        />
      )}
      {children}
    </li>
  );
}

export function ErrorLine({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-control bg-destructive/10 px-4 py-3 text-sm text-destructive"
      data-testid="onb-v4-error"
    >
      {message}
    </div>
  );
}
