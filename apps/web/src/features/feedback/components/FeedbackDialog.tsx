'use client';

import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { MessageSquare } from 'lucide-react';
import { Button, Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Beta feedback dialog (ux-fixes-plan.md 1.6) ─────────────────────────────
// The review's biggest beta gap: no way for a tester to tell us anything.
// One textarea, one button; the current path is attached automatically.

/** Mirrors the API's `feedback.submit` message limit. */
export const FEEDBACK_MAX_LENGTH = 2000;

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const textareaId = useId();
  const counterId = useId();
  const remaining = FEEDBACK_MAX_LENGTH - message.length;
  const nearLimit = remaining <= 100;

  const submitMutation = trpc.feedback.submit.useMutation({
    onSuccess: () => {
      capture('feedback_submitted', { path: pathname });
      setSent(true);
      setMessage('');
    },
  });

  function close() {
    setSent(false);
    submitMutation.reset();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Send feedback"
      description="Rough edge, missing feature, wrong number — anything helps during the beta."
      footer={
        sent ? (
          <Button className="w-full" onClick={close}>
            Done
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={message.trim().length === 0 || submitMutation.isPending}
            onClick={() => submitMutation.mutate({ message, path: pathname ?? undefined })}
          >
            {submitMutation.isPending ? 'Sending…' : 'Send feedback'}
          </Button>
        )
      }
    >
      {sent ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          Thank you, chef — we read every note. 🙏
        </p>
      ) : (
        <>
          <label htmlFor={textareaId} className="sr-only">
            Your feedback
          </label>
          <textarea
            id={textareaId}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={FEEDBACK_MAX_LENGTH}
            aria-describedby={counterId}
            rows={5}
            placeholder="What happened? What did you expect?"
            className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {/* Counter (F-PROF-2-2): the textarea stops at the limit, which used
              to look like the keyboard had broken. Only announced near it. */}
          <p
            id={counterId}
            aria-live={nearLimit ? 'polite' : 'off'}
            className={cn(
              'mt-1 text-right text-xs tabular-nums',
              remaining === 0 ? 'text-red-600' : nearLimit ? 'text-amber-700' : 'text-gray-600',
            )}
          >
            {remaining === 0
              ? `Limit reached: ${FEEDBACK_MAX_LENGTH.toLocaleString('en-US')} characters`
              : `${message.length.toLocaleString('en-US')} / ${FEEDBACK_MAX_LENGTH.toLocaleString('en-US')}`}
          </p>
          {submitMutation.isError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              Couldn&apos;t send that — please try again in a moment.
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}

/** Nav-row trigger used by the sidebar and the mobile More drawer. */
export function FeedbackNavButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900',
          className,
        )}
      >
        <MessageSquare className="h-[18px] w-[18px] shrink-0 text-gray-500" aria-hidden="true" />
        Send feedback
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
