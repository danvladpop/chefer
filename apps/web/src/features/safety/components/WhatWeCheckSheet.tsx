'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import type { TableSafety, TableSafetyPerson } from '@chefer/types';
import { Sheet } from '@chefer/ui';
import { SAFETY_COPY, WELLNESS_COPY } from '@chefer/utils';

// WhatWeCheckSheet (UX-02 "What we check" sheet — T-02.2). Web parity of the
// mobile component; rows come straight from `safety.getTable`'s TableSafety
// payload so the sheet always matches whatever the filter actually ran.

function personLine(person: TableSafetyPerson): string {
  const items = person.items.map((i) => i.label);
  const notes = person.notes.map((n) => `“${n}” (a note)`);
  const parts = [...items, ...notes];
  return parts.length > 0 ? parts.join(', ') : 'No allergies selected.';
}

export interface WhatWeCheckSheetProps {
  open: boolean;
  onClose: () => void;
  table: TableSafety;
  onEditPerson?: (person: TableSafetyPerson) => void;
}

export function WhatWeCheckSheet({ open, onClose, table, onEditPerson }: WhatWeCheckSheetProps) {
  const router = useRouter();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={SAFETY_COPY.sheetTitle}
      description={SAFETY_COPY.sheetEyebrow}
      size="md"
      footer={
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push('/preferences');
          }}
          className="min-h-11 w-full rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground hover:bg-accent"
        >
          {SAFETY_COPY.sheetAction}
        </button>
      }
    >
      <div className="space-y-1 px-5 pb-2">
        {table.people.map((person) => (
          <button
            key={person.who}
            type="button"
            onClick={onEditPerson ? () => onEditPerson(person) : undefined}
            disabled={!onEditPerson}
            className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-border py-2.5 text-left disabled:cursor-default"
          >
            <span className="w-20 shrink-0 text-sm font-medium capitalize">{person.who}</span>
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">
              {personLine(person)}
            </span>
            {onEditPerson ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : null}
          </button>
        ))}
        <div className="space-y-1 pt-3">
          <p className="text-sm font-semibold">{SAFETY_COPY.sheetHowHeading}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {SAFETY_COPY.sheetHowBody}
          </p>
          <p
            data-testid="what-we-check-advisory"
            className="text-xs leading-relaxed text-muted-foreground"
          >
            {WELLNESS_COPY.mealPlanAdvisoryDisclaimer}
          </p>
        </div>
      </div>
    </Sheet>
  );
}
