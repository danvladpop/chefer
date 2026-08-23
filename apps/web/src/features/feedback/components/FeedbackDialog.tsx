'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { capture } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';
import { MessageSquare } from 'lucide-react';
import { Button, Sheet } from '@chefer/ui';
import { cn } from '@chefer/utils';

// ─── Beta feedback dialog (ux-fixes-plan.md 1.6) ─────────────────────────────
// The review's biggest beta gap: no way for a tester to tell us anything.
// One textarea, one button; the current path is attached automatically.

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

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
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder="What happened? What did you expect?"
            className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {submitMutation.isError && (
            <p className="mt-2 text-xs text-red-600">
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
