import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button, buttonVariants } from './button';

export interface ErrorStateProps {
  /** Short headline; defaults to a generic load failure. */
  title?: string;
  message?: string;
  onRetry?: () => void;
  /** For server components, which can't pass a handler: a reload link. */
  retryHref?: string;
  retrying?: boolean;
  className?: string;
}

/**
 * What a screen shows when its data failed to load. Pages used to fall
 * through to their empty state on an API error — "No meal plan yet —
 * Generate" over a plan that exists — inviting the user to overwrite real
 * data (audit F-X-3-1). Render this before any empty-state branch.
 */
export function ErrorState({
  title = "Couldn't load this page",
  message = 'Check your connection and try again. Nothing you saved has been lost.',
  onRetry,
  retryHref,
  retrying = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center',
        className,
      )}
    >
      <AlertCircle className="h-8 w-8 text-gray-400" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-600">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      )}
      {!onRetry && retryHref && (
        <a href={retryHref} className={buttonVariants({ variant: 'outline' })}>
          Try again
        </a>
      )}
    </div>
  );
}
