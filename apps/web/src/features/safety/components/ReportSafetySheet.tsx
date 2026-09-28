'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Sheet } from '@chefer/ui';
import { SAFETY_COPY } from '@chefer/utils';

// T-01.5 — report a safety problem (UX-01 (d), AC10). Web parity of the
// mobile report-sheet.tsx. Sending a report hides the recipe from this
// user's plans and swaps at once.

const REASON_OPTIONS = [
  SAFETY_COPY.reportOptionCantEat,
  SAFETY_COPY.reportOptionLabelWrong,
  SAFETY_COPY.reportOptionSomethingElse,
];

export interface ReportSafetySheetProps {
  open: boolean;
  onClose: () => void;
  recipeId: string;
  recipeName: string;
  surface: string;
  onSent?: () => void;
}

export function ReportSafetySheet({
  open,
  onClose,
  recipeId,
  recipeName,
  surface,
  onSent,
}: ReportSafetySheetProps) {
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const utils = trpc.useUtils();

  const reportMutation = trpc.safety.report.useMutation({
    onSuccess: () => {
      onClose();
      setReason(null);
      setNote('');
      void utils.recipe.list.invalidate();
      void utils.mealPlan.invalidate();
      onSent?.();
    },
  });

  function handleSend() {
    if (!reason || reportMutation.isPending) return;
    reportMutation.mutate({
      recipeId,
      surface,
      reason,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={SAFETY_COPY.reportTitle}
      description={recipeName}
      size="md"
      footer={
        <div className="flex flex-col gap-2">
          {reportMutation.isError && (
            <p className="text-sm text-red-600">{reportMutation.error.message}</p>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={!reason || reportMutation.isPending}
            className="min-h-11 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {reportMutation.isPending ? 'Sending…' : SAFETY_COPY.reportSend}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 pb-4">
        <div role="radiogroup" aria-label={SAFETY_COPY.reportTitle} className="flex flex-col gap-2">
          {REASON_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={reason === option}
              onClick={() => setReason(option)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm font-medium transition ${
                reason === option
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-input text-muted-foreground hover:border-primary/40'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="report-safety-note" className="mb-1 block text-sm font-medium">
            {SAFETY_COPY.reportNoteLabel}
          </label>
          <textarea
            id="report-safety-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </Sheet>
  );
}
